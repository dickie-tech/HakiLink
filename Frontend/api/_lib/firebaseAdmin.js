
const admin = require("firebase-admin");

// ========================================
// INITIALIZE FIREBASE ADMIN
// ========================================

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        );

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

    } catch (error) {
        console.error("Firebase Admin initialization failed:", error.message);
        throw new Error("Server authentication configuration is invalid.");
    }
}

// ========================================
// EXPORT FIREBASE SERVICES
// ========================================

const db = admin.firestore();
const auth = admin.auth();

module.exports = {
    admin,
    db,
    auth
};
