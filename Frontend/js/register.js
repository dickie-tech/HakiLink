import { auth, db } from "./firebase.js";

import {
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// ========================================
// GET HTML ELEMENTS
// ========================================

const registerForm = document.getElementById("registerForm");

const accountTypes = document.querySelectorAll(
    'input[name="accountType"]'
);

const lawyerDetails = document.getElementById("lawyerDetails");
const firmDetails = document.getElementById("firmDetails");

const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");

const registerMessage = document.getElementById("registerMessage");


// ========================================
// ACCOUNT TYPE SELECTION
// ========================================

accountTypes.forEach((radio) => {

    radio.addEventListener("change", () => {

        if (radio.value === "lawyer" && radio.checked) {

            lawyerDetails.classList.remove("hidden");
            firmDetails.classList.add("hidden");

        } else if (radio.value === "lawfirm" && radio.checked) {

            lawyerDetails.classList.add("hidden");
            firmDetails.classList.remove("hidden");

        } else {

            lawyerDetails.classList.add("hidden");
            firmDetails.classList.add("hidden");
        }
    });
});


// ========================================
// PASSWORD VISIBILITY
// ========================================

const passwordToggles = document.querySelectorAll(
    ".toggle-password"
);

passwordToggles.forEach((button) => {

    button.addEventListener("click", () => {

        const targetId = button.dataset.target;
        const targetInput = document.getElementById(targetId);

        if (!targetInput) return;

        if (targetInput.type === "password") {

            targetInput.type = "text";
            button.textContent = "Hide";

        } else {

            targetInput.type = "password";
            button.textContent = "Show";
        }
    });
});


// ========================================
// REGISTRATION
// ========================================

registerForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    registerMessage.textContent = "";
    registerMessage.className = "register-message";


    // ========================================
    // GET FORM VALUES
    // ========================================

    const fullName =
        document.getElementById("fullName").value.trim();

    const email =
        document.getElementById("email").value.trim();

    const phone =
        document.getElementById("phone").value.trim();

    const accountType =
        document.querySelector(
            'input[name="accountType"]:checked'
        )?.value;


    const barAdmissionNumber =
        document.getElementById("barNumber")?.value.trim() || "";

    const practiceArea =
        document.getElementById("practiceArea")?.value.trim() || "";

    const firmName =
        document.getElementById("firmName")?.value.trim() || "";

    const registrationDetails =
        document.getElementById("firmRegistration")?.value.trim() || "";


    // ========================================
    // BASIC VALIDATION
    // ========================================

    if (!fullName || !email || !phone || !accountType) {

        showMessage(
            "Please fill in all required fields.",
            "error"
        );

        return;
    }


    if (password.value.length < 8) {

        showMessage(
            "Password must contain at least 8 characters.",
            "error"
        );

        return;
    }


    if (password.value !== confirmPassword.value) {

        showMessage(
            "Passwords do not match.",
            "error"
        );

        return;
    }


    // ========================================
    // CREATE FIREBASE ACCOUNT
    // ========================================

    try {

        showMessage(
            "Creating your HakiLink account...",
            "loading"
        );


        const userCredential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password.value
            );


        const user = userCredential.user;


        // ========================================
        // CREATE USER PROFILE
        // ========================================

        const userData = {

            uid: user.uid,

            fullName: fullName,

            email: email,

            phone: phone,

            role: accountType,

            createdAt: serverTimestamp()
        };


        // ========================================
        // LAWYER INFORMATION
        // ========================================

        if (accountType === "lawyer") {

            userData.barAdmissionNumber =
                barAdmissionNumber;

            userData.practiceArea =
                practiceArea;
        }


        // ========================================
        // LAW FIRM INFORMATION
        // ========================================

        if (accountType === "lawfirm") {

            userData.firmName =
                firmName;

            userData.registrationDetails =
                registrationDetails;
        }


        // ========================================
        // SAVE PROFILE TO FIRESTORE
        // ========================================

        await setDoc(
            doc(db, "users", user.uid),
            userData
        );


        // ========================================
        // SUCCESS
        // ========================================

        showMessage(
            "Account created successfully! Redirecting to login...",
            "success"
        );


        registerForm.reset();

        lawyerDetails.classList.add("hidden");
        firmDetails.classList.add("hidden");


        setTimeout(() => {

            window.location.href = "login.html";

        }, 2000);


    } catch (error) {

        console.error(
            "Registration error:",
            error
        );


        let message =
            "Something went wrong. Please try again.";


        switch (error.code) {

            case "auth/email-already-in-use":

                message =
                    "An account with this email already exists.";

                break;


            case "auth/invalid-email":

                message =
                    "Please enter a valid email address.";

                break;


            case "auth/weak-password":

                message =
                    "The password is too weak.";

                break;


            case "auth/network-request-failed":

                message =
                    "Network error. Please check your internet connection.";

                break;


            case "permission-denied":

                message =
                    "Account created, but your profile could not be saved. Please check Firestore permissions.";

                break;
        }


        showMessage(message, "error");
    }
});


// ========================================
// SHOW MESSAGE
// ========================================

function showMessage(message, type) {

    registerMessage.textContent = message;

    registerMessage.className =
        `register-message ${type}`;
}
