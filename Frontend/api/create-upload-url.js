
const { createClient } = require("@supabase/supabase-js");
const { db, auth } = require("./_lib/firebaseAdmin");
const { randomUUID } = require("crypto");

// ========================================
// SUPABASE CONFIGURATION
// ========================================

if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SECRET_KEY
) {
    throw new Error("Supabase server configuration is incomplete.");
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    }
);

const BUCKET = "lawyer-qualification-documents";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DOCUMENTS = 10;

// ========================================
// ALLOWED DOCUMENT TYPES
// ========================================

const allowedDocuments = {
    cv: ["application/pdf"],

    academic_certificate: [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ],

    transcript: [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ],

    professional_certificate: [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ],

    admission_certificate: [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ],

    practising_certificate: [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ],

    reference: [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ]
};

// ========================================
// ALLOWED FILE EXTENSIONS
// ========================================

const extensions = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png"
};

// ========================================
// CREATE SECURE UPLOAD URL
// ========================================

module.exports = async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Method not allowed."
        });
    }

    try {

        // 1. VERIFY FIREBASE AUTHENTICATION

        const authorization = req.headers.authorization || "";

        if (!authorization.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const idToken = authorization.substring(7);

        const decodedToken = await auth.verifyIdToken(idToken);

        const lawyerId = decodedToken.uid;

        // 2. VALIDATE REQUEST DATA

        const {
            applicationId,
            documentType,
            fileName,
            mimeType,
            fileSize
        } = req.body || {};

        if (
            typeof applicationId !== "string" ||
            !applicationId.trim() ||
            applicationId.length > 128
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid application ID."
            });
        }

        if (
            typeof documentType !== "string" ||
            !Object.prototype.hasOwnProperty.call(
                allowedDocuments,
                documentType
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid document category."
            });
        }

        if (
            typeof fileName !== "string" ||
            !fileName.trim() ||
            fileName.length > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid file name."
            });
        }

        if (
            !Number.isInteger(fileSize) ||
            fileSize <= 0 ||
            fileSize > MAX_FILE_SIZE
        ) {
            return res.status(400).json({
                success: false,
                message: "Each document must be no larger than 5 MB."
            });
        }

        if (
            typeof mimeType !== "string" ||
            !allowedDocuments[documentType].includes(mimeType)
        ) {
            return res.status(400).json({
                success: false,
                message: "This file format is not allowed."
            });
        }

        // 3. VERIFY APPLICATION OWNERSHIP

        const draftRef = db
            .collection("firmApplicationDrafts")
            .doc(applicationId);

        const draftSnapshot = await draftRef.get();

        if (!draftSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Application draft not found."
            });
        }

        const draft = draftSnapshot.data();

        if (draft.lawyerId !== lawyerId) {
            return res.status(403).json({
                success: false,
                message: "You cannot upload documents to this application."
            });
        }

        if (draft.status !== "draft") {
            return res.status(403).json({
                success: false,
                message: "This application is no longer editable."
            });
        }

        // 4. CHECK DOCUMENT COUNT

        const existingDocuments = Array.isArray(draft.documents)
            ? draft.documents
            : [];

        if (existingDocuments.length >= MAX_DOCUMENTS) {
            return res.status(400).json({
                success: false,
                message: `You can upload a maximum of ${MAX_DOCUMENTS} documents per application.`
            });
        }

        // 5. GENERATE SERVER-CONTROLLED STORAGE PATH

        const extension = extensions[mimeType];

        const fileId = randomUUID();

        const storagePath =
            `${lawyerId}/${applicationId}/${fileId}.${extension}`;

        // 6. GENERATE TEMPORARY SIGNED UPLOAD TOKEN

        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUploadUrl(storagePath);

        if (error || !data || !data.token) {

            console.error(
                "Supabase upload authorization error:",
                error?.message
            );

            return res.status(500).json({
                success: false,
                message: "Could not authorize document upload."
            });
        }

        // 7. RETURN SECURE UPLOAD DETAILS

        return res.status(200).json({
            success: true,
            message: "Upload authorized.",
            uploadToken: data.token,
            storagePath,
            bucket: BUCKET,
            documentType,
            fileName: fileName.trim(),
            mimeType,
            fileSize
        });

    } catch (error) {

        console.error("Upload authorization error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to authorize document upload."
        });
    }
};
