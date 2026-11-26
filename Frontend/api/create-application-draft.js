
const { admin, db, auth } = require("./_lib/firebaseAdmin");

// ========================================
// CREATE APPLICATION DRAFT
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

        const idToken = authorization.split(" ")[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const lawyerId = decodedToken.uid;

        // 2. VALIDATE THE REQUEST

        const { firmId } = req.body || {};

        if (
            typeof firmId !== "string" ||
            !firmId.trim() ||
            firmId.length > 128
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid law firm is required."
            });
        }

        // 3. VERIFY THE LAWYER'S ACCOUNT

        const userRef = db.collection("users").doc(lawyerId);
        const userSnapshot = await userRef.get();

        if (!userSnapshot.exists) {
            return res.status(403).json({
                success: false,
                message: "Lawyer profile not found."
            });
        }

        const user = userSnapshot.data();

        if (user.role !== "lawyer") {
            return res.status(403).json({
                success: false,
                message: "Only registered lawyers can apply."
            });
        }

        if (
            !user.fullName ||
            !user.practiceArea ||
            !user.barAdmissionNumber
        ) {
            return res.status(400).json({
                success: false,
                message: "Complete your lawyer profile before applying."
            });
        }

        // 4. VERIFY THE RECEIVING LAW FIRM

        const firmRef = db.collection("publicFirms").doc(firmId);
        const firmSnapshot = await firmRef.get();

        if (!firmSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "The selected law firm could not be found."
            });
        }

        const firm = firmSnapshot.data();

        // 5. CHECK FOR AN EXISTING ACTIVE APPLICATION

        const existingApplications = await db
            .collection("firmApplications")
            .where("lawyerId", "==", lawyerId)
            .where("firmId", "==", firmId)
            .get();

        const hasActiveApplication = existingApplications.docs.some(doc => {
            const status = doc.data().status;
            return status === "pending" || status === "accepted";
        });

        if (hasActiveApplication) {
            return res.status(409).json({
                success: false,
                message: "You already have an active application with this firm."
            });
        }

        // 6. CREATE A PRIVATE DRAFT

        const draftRef = db.collection("firmApplicationDrafts").doc();

        await draftRef.set({
            lawyerId,
            firmId,

            lawyerName: user.fullName,
            practiceArea: user.practiceArea,
            barAdmissionNumber: user.barAdmissionNumber,

            firmName: firm.firmName || "Law Firm",

            status: "draft",

            qualifications: "",
            experience: "",
            coverLetter: "",

            documents: [],

            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(201).json({
            success: true,
            message: "Application draft created successfully.",
            applicationId: draftRef.id
        });

    } catch (error) {
        console.error("Application draft error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create application draft."
        });
    }
};
