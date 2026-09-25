import { auth, db } from "./firebase.js";

import {
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


const loginForm = document.getElementById("loginForm");

const passwordInput =
    document.getElementById("password");

const togglePassword =
    document.getElementById("togglePassword");

const loginMessage =
    document.getElementById("loginMessage");


// ============================================
// SHOW / HIDE PASSWORD
// ============================================

togglePassword.addEventListener("click", () => {

    if (passwordInput.type === "password") {

        passwordInput.type = "text";

        togglePassword.textContent = "Hide";

    } else {

        passwordInput.type = "password";

        togglePassword.textContent = "Show";
    }

});


// ============================================
// LOGIN FORM
// ============================================

loginForm.addEventListener("submit", async (event) => {

    event.preventDefault();


    const email =
        document.getElementById("email").value.trim();

    const password =
        passwordInput.value;


    // ========================================
    // VALIDATION
    // ========================================

    if (!email || !password) {

        showMessage(
            "Please enter your email and password.",
            "error"
        );

        return;
    }


    // ========================================
    // LOGIN
    // ========================================

    try {

        showMessage(
            "Signing you in...",
            "loading"
        );


        const userCredential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );


        const user = userCredential.user;


        console.log(
            "Successfully logged in:",
            user.email
        );


        // ====================================
        // GET USER PROFILE
        // ====================================

        const userRef =
            doc(db, "users", user.uid);

        const userSnapshot =
            await getDoc(userRef);


        if (!userSnapshot.exists()) {

            showMessage(
                "Your account exists, but your HakiLink profile could not be found.",
                "error"
            );

            return;
        }


        const userData =
            userSnapshot.data();


        console.log(
            "User profile:",
            userData
        );


        // ====================================
        // SUCCESS
        // ====================================

        showMessage(
            "Login successful! Redirecting...",
            "success"
        );


        // ====================================
        // REDIRECT BASED ON ROLE
        // ====================================

        setTimeout(() => {

            if (userData.role === "lawyer") {

                window.location.href =
                    "../dashboard/lawyer-dashboard.html";

            } else if (userData.role === "lawfirm") {

                window.location.href =
                    "../dashboard/firm-dashboard.html";

            } else {

                window.location.href =
                    "../dashboard/client-dashboard.html";
            }

        }, 1200);


    } catch (error) {

        console.error(
            "Login error:",
            error
        );


        let message =
            "Something went wrong. Please try again.";


        switch (error.code) {

            case "auth/invalid-credential":

                message =
                    "Incorrect email or password.";

                break;


            case "auth/user-not-found":

                message =
                    "No account was found with this email.";

                break;


            case "auth/wrong-password":

                message =
                    "Incorrect password.";

                break;


            case "auth/invalid-email":

                message =
                    "Please enter a valid email address.";

                break;


            case "auth/user-disabled":

                message =
                    "This account has been disabled.";

                break;


            case "auth/too-many-requests":

                message =
                    "Too many login attempts. Please try again later.";

                break;


            case "auth/network-request-failed":

                message =
                    "Network error. Please check your internet connection.";

                break;
        }


        showMessage(message, "error");
    }

});


// ============================================
// SHOW MESSAGE
// ============================================

function showMessage(message, type) {

    loginMessage.textContent = message;

    loginMessage.className =
        `login-message ${type}`;
}

