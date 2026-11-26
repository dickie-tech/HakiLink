
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

// ========================================
// DELETE APPLICATION DOCUMENT
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

        const { applicationId, documentId } = req.body || {};

        if (
            typeof applicationId !== "string" ||
            !applicationId.trim() ||
            applicationId.length > 128 ||
            typeof documentId !== "string" ||
            !/^[a-f0-9-]{36}$/i.test(documentId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid application or document ID."
            });
        }

        const draftRef = db
            .collection("firmApplicationDrafts")
            .doc(applicationId);

        // 3. VERIFY APPLICATION AND DOCUMENT OWNERSHIP

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

        const documents = Array.isArray(draft.documents)
            ? draft.documents
            : [];

        const document = documents.find(
            item => item.documentId === documentId
        );

        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Document not found."
            });
        }

        // 4. VALIDATE STORAGE PATH

        const expectedPrefix = `${lawyerId}/${applicationId}/`;

        if (
            typeof document.storagePath !== "string" ||
            !document.storagePath.startsWith(expectedPrefix)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid document storage path."
            });
        }

        const storedFileName = document.storagePath.substring(
            expectedPrefix.length
        );

        if (
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(pdf|jpg|png)$/i.test(storedFileName)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid stored file name."
            });
        }

        // 5. DELETE FILE FROM SUPABASE FIRST

        const { error: storageError } = await supabase.storage
            .from(BUCKET)
            .remove([document.storagePath]);

        if (storageError) {
            console.error(
                "Supabase document deletion error:",
                storageError.message
            );

            return res.status(500).json({
                success: false,
                message: "Could not delete the stored document. Please try again."
            });
        }

        // 6. REMOVE DOCUMENT METADATA TRANSACTIONALLY

        await db.runTransaction(async transaction => {

            const latestSnapshot = await transaction.get(draftRef);

            if (!latestSnapshot.exists) {
                throw new Error("APPLICATION_NOT_FOUND");
            }

            const latestDraft = latestSnapshot.data();

            if (latestDraft.lawyerId !== lawyerId) {
                throw new Error("NOT_APPLICATION_OWNER");
            }

            if (latestDraft.status !== "draft") {
                throw new Error("APPLICATION_NOT_EDITABLE");
            }

            const latestDocuments = Array.isArray(
                latestDraft.documents
            )
                ? latestDraft.documents
                : [];

            const documentStillExists = latestDocuments.some(
                item =>
                    item.documentId === documentId &&
                    item.storagePath === document.storagePath
            );

            if (!documentStillExists) {
                throw new Error("DOCUMENT_NOT_FOUND");
            }

            transaction.update(draftRef, {
                documents: latestDocuments.filter(
                    item => item.documentId !== documentId
                ),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // 7. RETURN SUCCESS

        return res.status(200).json({
            success: true,
            message: "Document removed successfully.",
            documentId
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

            DOCUMENT_NOT_FOUND: [
                404,
                "Document not found."
            ]
        };

        const knownError = messages[error.message];

        if (knownError) {
            return res.status(knownError[0]).json({
                success: false,
                message: knownError[1]
            });
        }

        console.error("Document deletion error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to remove document."
        });
    }
};
