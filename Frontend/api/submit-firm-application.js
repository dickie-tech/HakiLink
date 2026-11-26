
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
// VALIDATE DOCUMENT METADATA
// ========================================

function validateDocuments(documents, lawyerId, applicationId) {

    if (
        !Array.isArray(documents) ||
        documents.length > MAX_DOCUMENTS
    ) {
        throw new Error("INVALID_DOCUMENTS");
    }

    const documentIds = new Set();
    const storagePaths = new Set();

    let hasCV = false;
    let hasAcademicCertificate = false;

    for (const document of documents) {

        if (
            !document ||
            typeof document !== "object" ||
            typeof document.documentId !== "string" ||
            typeof document.documentType !== "string" ||
            typeof document.fileName !== "string" ||
            typeof document.mimeType !== "string" ||
            typeof document.storagePath !== "string" ||
            !Number.isInteger(document.fileSize)
        ) {
            throw new Error("INVALID_DOCUMENTS");
        }

        if (!Object.prototype.hasOwnProperty.call(
            allowedDocuments,
            document.documentType
        )) {
            throw new Error("INVALID_DOCUMENTS");
        }

        if (
            !allowedDocuments[document.documentType].includes(
                document.mimeType
            )
        ) {
            throw new Error("INVALID_DOCUMENTS");
        }

        if (
            document.fileSize <= 0 ||
            document.fileSize > MAX_FILE_SIZE
        ) {
            throw new Error("INVALID_DOCUMENTS");
        }

        const expectedPrefix = `${lawyerId}/${applicationId}/`;

        if (!document.storagePath.startsWith(expectedPrefix)) {
            throw new Error("INVALID_DOCUMENTS");
        }

        const storedFileName = document.storagePath.substring(
            expectedPrefix.length
        );

        const expectedExtension = extensions[document.mimeType];

        const filePattern =
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(pdf|jpg|png)$/i;

        if (
            !filePattern.test(storedFileName) ||
            !storedFileName.endsWith(`.${expectedExtension}`)
        ) {
            throw new Error("INVALID_DOCUMENTS");
        }

        if (
            document.documentId !== storedFileName.split(".")[0]
        ) {
            throw new Error("INVALID_DOCUMENTS");
        }

        if (
            documentIds.has(document.documentId) ||
            storagePaths.has(document.storagePath)
        ) {
            throw new Error("INVALID_DOCUMENTS");
        }

        documentIds.add(document.documentId);
        storagePaths.add(document.storagePath);

        if (document.documentType === "cv") {
            if (hasCV) {
                throw new Error("DUPLICATE_CV");
            }

            hasCV = true;
        }

        if (document.documentType === "academic_certificate") {
            hasAcademicCertificate = true;
        }
    }

    if (!hasCV || !hasAcademicCertificate) {
        throw new Error("REQUIRED_DOCUMENTS_MISSING");
    }

    return documents;
}

// ========================================
// VERIFY FILES EXIST IN PRIVATE STORAGE
// ========================================

async function verifyStoredDocuments(documents, lawyerId, applicationId) {

    const folder = `${lawyerId}/${applicationId}`;

    const { data: files, error } = await supabase.storage
        .from(BUCKET)
        .list(folder, {
            limit: 100
        });

    if (error) {
        console.error("Document storage verification error:", error.message);
        throw new Error("DOCUMENT_STORAGE_CHECK_FAILED");
    }

    const availableFiles = new Set(
        (files || []).map(file => file.name)
    );

    for (const document of documents) {

        const storedFileName = document.storagePath.substring(
            folder.length + 1
        );

        if (!availableFiles.has(storedFileName)) {
            throw new Error("DOCUMENT_FILE_MISSING");
        }
    }
}

// ========================================
// SUBMIT FIRM APPLICATION
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
            qualifications,
            experience,
            coverLetter
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
            typeof qualifications !== "string" ||
            !qualifications.trim() ||
            qualifications.trim().length > 2000 ||
            typeof experience !== "string" ||
            !experience.trim() ||
            experience.trim().length > 5000 ||
            typeof coverLetter !== "string" ||
            !coverLetter.trim() ||
            coverLetter.trim().length > 3000
        ) {
            return res.status(400).json({
                success: false,
                message: "Complete your qualifications, experience and cover letter. Check the maximum field lengths."
            });
        }

        // 3. GET APPLICATION DRAFT

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

        const initialDraft = draftSnapshot.data();

        if (initialDraft.lawyerId !== lawyerId) {
            return res.status(403).json({
                success: false,
                message: "You do not own this application."
            });
        }

        if (initialDraft.status !== "draft") {
            return res.status(409).json({
                success: false,
                message: "This application has already been submitted or is no longer editable."
            });
        }

        // 4. VERIFY CURRENT LAWYER PROFILE

        const userSnapshot = await db
            .collection("users")
            .doc(lawyerId)
            .get();

        if (!userSnapshot.exists) {
            return res.status(403).json({
                success: false,
                message: "Lawyer profile not found."
            });
        }

        const user = userSnapshot.data();

        if (
            !user.fullName ||
            !user.practiceArea ||
            !user.barAdmissionNumber
        ) {
            return res.status(400).json({
                success: false,
                message: "Complete your lawyer profile before submitting."
            });
        }

        // 5. VERIFY RECEIVING FIRM

        const firmSnapshot = await db
            .collection("publicFirms")
            .doc(initialDraft.firmId)
            .get();

        if (!firmSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "The receiving law firm could not be found."
            });
        }

        const firm = firmSnapshot.data();

        // 6. VALIDATE REGISTERED DOCUMENTS

        const documents = validateDocuments(
            initialDraft.documents,
            lawyerId,
            applicationId
        );

        // 7. VERIFY DOCUMENT FILES EXIST IN SUPABASE

        await verifyStoredDocuments(
            documents,
            lawyerId,
            applicationId
        );

        // 8. CREATE FINAL APPLICATION TRANSACTIONALLY

        const firmApplicationsRef = db.collection("firmApplications");

        const result = await db.runTransaction(async transaction => {

            const latestDraftSnapshot = await transaction.get(draftRef);

            if (!latestDraftSnapshot.exists) {
                throw new Error("APPLICATION_NOT_FOUND");
            }

            const draft = latestDraftSnapshot.data();

            if (draft.lawyerId !== lawyerId) {
                throw new Error("NOT_APPLICATION_OWNER");
            }

            if (draft.status !== "draft") {
                throw new Error("APPLICATION_ALREADY_SUBMITTED");
            }

            // Verify that the documents have not changed
            const latestDocuments = validateDocuments(
                draft.documents,
                lawyerId,
                applicationId
            );

            if (
                latestDocuments.length !== documents.length ||
                latestDocuments.some(document =>
                    !documents.some(existing =>
                        existing.documentId === document.documentId &&
                        existing.storagePath === document.storagePath
                    )
                )
            ) {
                throw new Error("DOCUMENTS_CHANGED");
            }

            // Read current profile and firm inside transaction
            const userRef = db.collection("users").doc(lawyerId);
            const firmRef = db.collection("publicFirms").doc(draft.firmId);

            const latestUserSnapshot = await transaction.get(userRef);
            const latestFirmSnapshot = await transaction.get(firmRef);

            if (!latestUserSnapshot.exists) {
                throw new Error("LAWYER_PROFILE_NOT_FOUND");
            }

            if (!latestFirmSnapshot.exists) {
                throw new Error("FIRM_NOT_FOUND");
            }

            const latestUser = latestUserSnapshot.data();

            if (
                !latestUser.fullName ||
                !latestUser.practiceArea ||
                !latestUser.barAdmissionNumber
            ) {
                throw new Error("INCOMPLETE_LAWYER_PROFILE");
            }

            // Check existing applications
            const existingQuery = firmApplicationsRef
                .where("lawyerId", "==", lawyerId)
                .where("firmId", "==", draft.firmId);

            const existingSnapshot = await transaction.get(existingQuery);

            const hasActiveApplication = existingSnapshot.docs.some(doc => {
                const status = doc.data().status;

                return status === "pending" || status === "accepted";
            });

            if (hasActiveApplication) {
                throw new Error("ACTIVE_APPLICATION_EXISTS");
            }

            // Create application
            const applicationRef = firmApplicationsRef.doc();

            const submittedAt =
                admin.firestore.FieldValue.serverTimestamp();

            const latestFirm = latestFirmSnapshot.data();

            const applicationData = {
                firmId: draft.firmId,
                firmName: latestFirm.firmName || "Law Firm",

                lawyerId,
                lawyerName: latestUser.fullName,
                practiceArea: latestUser.practiceArea,
                barAdmissionNumber: latestUser.barAdmissionNumber,

                qualifications: qualifications.trim(),
                experience: experience.trim(),
                coverLetter: coverLetter.trim(),

                documents: latestDocuments,

                status: "pending",
                submittedAt
            };

            transaction.create(applicationRef, applicationData);

            // Close draft
            transaction.update(draftRef, {
                status: "submitted",
                finalApplicationId: applicationRef.id,
                submittedAt,
                updatedAt: submittedAt
            });

            return {
                applicationId: applicationRef.id,
                firmName: latestFirm.firmName || "Law Firm"
            };
        });

        // 9. RETURN SUCCESS

        return res.status(201).json({
            success: true,
            message: "Your application has been submitted successfully.",
            applicationId: result.applicationId,
            firmName: result.firmName
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

            APPLICATION_ALREADY_SUBMITTED: [
                409,
                "This application has already been submitted."
            ],

            REQUIRED_DOCUMENTS_MISSING: [
                400,
                "Please upload your CV and at least one academic certificate."
            ],

            INVALID_DOCUMENTS: [
                400,
                "One or more uploaded documents have invalid information."
            ],

            DUPLICATE_CV: [
                400,
                "Only one CV is allowed per application."
            ],

            DOCUMENT_FILE_MISSING: [
                400,
                "One or more uploaded files could not be found. Please upload them again."
            ],

            DOCUMENT_STORAGE_CHECK_FAILED: [
                500,
                "Unable to verify uploaded documents. Please try again."
            ],

            DOCUMENTS_CHANGED: [
                409,
                "Your uploaded documents changed during submission. Please try again."
            ],

            ACTIVE_APPLICATION_EXISTS: [
                409,
                "You already have an active application with this firm."
            ],

            LAWYER_PROFILE_NOT_FOUND: [
                403,
                "Lawyer profile not found."
            ],

            FIRM_NOT_FOUND: [
                404,
                "The receiving law firm could not be found."
            ],

            INCOMPLETE_LAWYER_PROFILE: [
                400,
                "Complete your lawyer profile before submitting."
            ]
        };

        const knownError = messages[error.message];

        if (knownError) {
            return res.status(knownError[0]).json({
                success: false,
                message: knownError[1]
            });
        }

        console.error("Application submission error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to submit your application."
        });
    }
};
