// ============================================
// HAKILINK CLIENT DASHBOARD
// ============================================

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// ============================================
// DOM ELEMENTS
// ============================================

const welcomeName = document.getElementById("welcomeName");
const topbarUserName = document.getElementById("topbarUserName");

const profileName = document.getElementById("profileName");
const profileFullName = document.getElementById("profileFullName");
const profileEmail = document.getElementById("profileEmail");
const profilePhone = document.getElementById("profilePhone");

const userAvatar = document.getElementById("userAvatar");
const profileAvatar = document.getElementById("profileAvatar");

const logoutButton = document.getElementById("logoutButton");


// ============================================
// GET INITIALS
// ============================================

function getInitials(name) {

    if (!name) {
        return "HL";
    }

    const words = name.trim().split(/\s+/);

    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    }

    return (
        words[0].charAt(0) +
        words[words.length - 1].charAt(0)
    ).toUpperCase();
}


// ============================================
// LOAD CLIENT PROFILE
// ============================================

async function loadClientProfile(user) {

    try {

        const userRef = doc(db, "users", user.uid);

        const userSnapshot = await getDoc(userRef);

        if (!userSnapshot.exists()) {

            console.error("User profile not found in Firestore.");

            return;
        }

        const userData = userSnapshot.data();

        const fullName =
            userData.fullName ||
            user.displayName ||
            "HakiLink User";

        const email =
            userData.email ||
            user.email ||
            "No email";

        const phone =
            userData.phone ||
            "Not provided";

        const role =
            userData.role ||
            "client";


        // ============================================
        // DISPLAY NAME
        // ============================================

        if (welcomeName) {
            welcomeName.textContent = fullName;
        }

        if (topbarUserName) {
            topbarUserName.textContent = fullName;
        }

        if (profileName) {
            profileName.textContent = fullName;
        }

        if (profileFullName) {
            profileFullName.textContent = fullName;
        }


        // ============================================
        // EMAIL
        // ============================================

        if (profileEmail) {
            profileEmail.textContent = email;
        }


        // ============================================
        // PHONE
        // ============================================

        if (profilePhone) {
            profilePhone.textContent = phone;
        }


        // ============================================
        // AVATAR INITIALS
        // ============================================

        const initials = getInitials(fullName);

        if (userAvatar) {
            userAvatar.textContent = initials;
        }

        if (profileAvatar) {
            profileAvatar.textContent = initials;
        }


        // ============================================
        // CHECK ROLE
        // ============================================

        if (
            role !== "client"
        ) {

            console.warn(
                "This account is not registered as a client."
            );

        }

    } catch (error) {

        console.error(
            "Error loading client profile:",
            error
        );

    }

}


// ============================================
// AUTH STATE
// ============================================

onAuthStateChanged(auth, async (user) => {

    if (user) {

        console.log(
            "Logged-in user:",
            user.uid
        );

        await loadClientProfile(user);

    } else {

        console.log(
            "No authenticated user. Redirecting..."
        );

        window.location.href = "../auth/login.html";

    }

});


// ============================================
// LOGOUT
// ============================================

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async () => {

            try {

                await signOut(auth);

                window.location.href =
                    "../pages/login.html";

            } catch (error) {

                console.error(
                    "Logout error:",
                    error
                );

                alert(
                    "Unable to log out. Please try again."
                );

            }

        }
    );

}