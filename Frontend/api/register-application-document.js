
const { createClient } = require("@supabase/supabase-js");
const { db, auth, admin } = require("./_lib/firebaseAdmin");

// ========================================
// CONFIGURATION
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

const extensions = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png"
};

// ========================================
// VERIFY ACTUAL FILE CONTENT
// ========================================

function verifyFileSignature(buffer, mimeType) {

    if (mimeType === "application/pdf") {
        return buffer.subarray(0, 5).toString() === "%PDF-";
    }

    if (mimeType === "image/jpeg") {
        return (
            buffer.length >= 3 &&
            buffer[0] === 0xFF &&
            buffer[1] === 0xD8 &&
            buffer[2] === 0xFF
        );
    }

    if (mimeType === "image/png") {
        const signature = Buffer.from([
            0x89, 0x50, 0x4E, 0x47,
            0x0D, 0x0A, 0x1A, 0x0A
        ]);

        return buffer.subarray(0, 8).equals(signature);
    }

    return false;
}

// ========================================
// REGISTER UPLOADED DOCUMENT
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

        // 2. VALIDATE REQUEST

        const {
            applicationId,
            storagePath,
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
            typeof mimeType !== "string" ||
            !allowedDocuments[documentType].includes(mimeType)
        ) {
            return res.status(400).json({
                success: false,
                message: "Unsupported document format."
            });
        }

        if (
            !Number.isInteger(fileSize) ||
            fileSize <= 0 ||
            fileSize > MAX_FILE_SIZE
        ) {
            return res.status(400).json({
                success: false,
                message: "Document must not exceed 5 MB."
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
                message: "You do not own this application."
            });
        }

        if (draft.status !== "draft") {
            return res.status(403).json({
                success: false,
                message: "This application is no longer editable."
            });
        }

        // 4. VALIDATE STORAGE PATH

        const expectedPrefix = `${lawyerId}/${applicationId}/`;

        if (
            typeof storagePath !== "string" ||
            !storagePath.startsWith(expectedPrefix)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid document storage path."
            });
        }

        const storedFileName = storagePath.substring(
            expectedPrefix.length
        );

        const expectedExtension = extensions[mimeType];

        const fileNamePattern =
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(pdf|jpg|png)$/i;

        if (
            !fileNamePattern.test(storedFileName) ||
            !storedFileName.endsWith(`.${expectedExtension}`)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid stored file name."
            });
        }

        // 5. DOWNLOAD FILE FROM PRIVATE STORAGE

        const { data: uploadedFile, error: downloadError } =
            await supabase.storage
                .from(BUCKET)
                .download(storagePath);

        if (downloadError || !uploadedFile) {
            console.error(
                "Supabase file verification error:",
                downloadError?.message
            );

            return res.status(400).json({
                success: false,
                message: "The uploaded document could not be verified."
            });
        }

        // 6. VERIFY ACTUAL FILE SIZE AND CONTENT

        const fileBuffer = Buffer.from(
            await uploadedFile.arrayBuffer()
        );

        if (
            fileBuffer.length <= 0 ||
            fileBuffer.length > MAX_FILE_SIZE ||
            fileBuffer.length !== fileSize
        ) {
            return res.status(400).json({
                success: false,
                message: "The uploaded file size is invalid."
            });
        }

        if (!verifyFileSignature(fileBuffer, mimeType)) {
            return res.status(400).json({
                success: false,
                message: "The actual file format does not match the selected format."
            });
        }

        // 7. PREPARE DOCUMENT METADATA

        const documentId = storedFileName.split(".")[0];

        const safeFileName = fileName
            .trim()
            .replace(/[\u0000-\u001F\u007F]/g, "");

        const newDocument = {
            documentId,
            documentType,
            fileName: safeFileName,
            mimeType,
            fileSize: fileBuffer.length,
            storagePath,
            uploadedAt: admin.firestore.Timestamp.now()
        };

        // 8. ATOMICALLY REGISTER DOCUMENT

        await db.runTransaction(async transaction => {

            const latestDraft = await transaction.get(draftRef);

            if (!latestDraft.exists) {
                throw new Error("APPLICATION_NOT_FOUND");
            }

            const latestData = latestDraft.data();

            if (latestData.lawyerId !== lawyerId) {
                throw new Error("NOT_APPLICATION_OWNER");
            }

            if (latestData.status !== "draft") {
                throw new Error("APPLICATION_NOT_EDITABLE");
            }

            const existingDocuments = Array.isArray(
                latestData.documents
            )
                ? latestData.documents
                : [];

            if (existingDocuments.length >= MAX_DOCUMENTS) {
                throw new Error("DOCUMENT_LIMIT_REACHED");
            }

            if (existingDocuments.some(
                doc => doc.storagePath === storagePath
            )) {
                throw new Error("DOCUMENT_ALREADY_REGISTERED");
            }

            if (
                documentType === "cv" &&
                existingDocuments.some(
                    doc => doc.documentType === "cv"
                )
            ) {
                throw new Error("CV_ALREADY_UPLOADED");
            }

            transaction.update(draftRef, {
                documents: [
                    ...existingDocuments,
                    newDocument
                ],
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // 9. RETURN SUCCESS

        return res.status(200).json({
            success: true,
            message: "Document registered successfully.",
            document: newDocument
        });

    } catch (error) {

        const messages = {
            APPLICATION_NOT_FOUND: [
                404,
                "Application draft not found."
            ],

            NOT_APPLICATION_OWNER: [
                403,
                "You do not own this application."
            ],

            APPLICATION_NOT_EDITABLE: [
                403,
                "This application is no longer editable."
            ],

            DOCUMENT_LIMIT_REACHED: [
                400,
                "You can upload a maximum of 10 documents."
            ],

            DOCUMENT_ALREADY_REGISTERED: [
                409,
                "This document has already been registered."
            ],

            CV_ALREADY_UPLOADED: [
                409,
                "A CV has already been uploaded."
            ]
        };

        const knownError = messages[error.message];

        if (knownError) {
            return res.status(knownError[0]).json({
                success: false,
                message: knownError[1]
            });
        }

        console.error("Document registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to register uploaded document."
        });
    }
};
