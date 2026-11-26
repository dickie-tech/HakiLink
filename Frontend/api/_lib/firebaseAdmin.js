
const { initializeApp, getApps, cert } = require("firebase-admin/app");

const { getAuth } = require("firebase-admin/auth");

const {
    getFirestore,
    FieldValue,
    Timestamp
} = require("firebase-admin/firestore");

// ========================================
// VALIDATE FIREBASE CONFIGURATION
// ========================================

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON environment variable is missing."
    );
}

let serviceAccount;

try {
    serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    );
} catch (error) {
    console.error("Firebase service account JSON is invalid:", error.message);
    throw new Error("Firebase Admin configuration is invalid.");
}

// ========================================
// INITIALIZE FIREBASE ADMIN
// ========================================

const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount)
    });

// ========================================
// FIREBASE SERVICES
// ========================================

const db = getFirestore(app);
const auth = getAuth(app);

// Compatibility helper for existing API files
const firestore = Object.assign(
    () => db,
    {
        FieldValue,
        Timestamp
    }
);

const admin = {
    firestore
};

module.exports = {
    admin,
    db,
    auth
};
