
import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================
   GET HTML ELEMENTS
========================================= */

const navLinks = document.querySelectorAll(".nav-link");

const dashboardSections =
    document.querySelectorAll(".dashboard-section");

const welcomeHeading =
    document.getElementById("welcomeHeading");

const addLawyerButton =
    document.getElementById("addLawyerButton");

const sidebarFirmName =
    document.getElementById("sidebarFirmName");

const topbarFirmName =
    document.getElementById("topbarFirmName");

const firmAvatar =
    document.getElementById("firmAvatar");

const logoutButton =
    document.getElementById("logoutButton");

const firmProfileContent =
    document.getElementById("firmProfileContent");


/* =========================================
   GLOBAL STATE
========================================= */

let currentUser = null;
let currentFirmData = null;
let firmApplications = [];

const firmApplicationsList =
    document.getElementById("firmApplicationsList");

const applicationCount =
    document.getElementById("applicationCount");

const totalApplications =
    document.getElementById("totalApplications");

const pendingApplications =
    document.getElementById("pendingApplications");

const acceptedApplications =
    document.getElementById("acceptedApplications");

const refreshApplicationsButton =
    document.getElementById("refreshApplicationsButton");

/* =========================================
   DASHBOARD NAVIGATION
========================================= */

function openSection(sectionId) {

    const targetSection =
        document.getElementById(sectionId);

    if (
        !targetSection ||
        !targetSection.classList.contains("dashboard-section")
    ) {
        return;
    }

    dashboardSections.forEach(section => {
        section.classList.remove("active");
    });

    navLinks.forEach(link => {
        link.classList.remove("active");
        link.removeAttribute("aria-current");
    });

    targetSection.classList.add("active");

    const activeLink = document.querySelector(
        `.nav-link[data-section="${sectionId}"]`
    );

    if (activeLink) {
        activeLink.classList.add("active");
        activeLink.setAttribute("aria-current", "page");
    }

    const sectionHeading =
        targetSection.querySelector("h2");

    if (welcomeHeading && sectionHeading) {
        welcomeHeading.textContent =
            sectionHeading.textContent;
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================================
   NAVIGATION EVENTS
========================================= */

navLinks.forEach(link => {

    link.addEventListener("click", () => {

        openSection(link.dataset.section);

    });

});


/* =========================================
   LOAD FIRM ACCOUNT
========================================= */

async function loadFirmProfile(user) {

    try {

        const firmRef = doc(db, "users", user.uid);

        const firmSnapshot = await getDoc(firmRef);

        if (!firmSnapshot.exists()) {

            showToast(
                "Your law firm account could not be found."
            );

            return;
        }

        const firmData = firmSnapshot.data();

        // Verify account role
        if (firmData.role !== "lawfirm") {

            showToast(
                "Access denied. This dashboard is for law firms only."
            );

            await signOut(auth);

            window.location.href = "../pages/login.html";

            return;
        }

        currentUser = user;
        currentFirmData = firmData;

        const firmName =
            firmData.firmName || "Law Firm";

        updateFirmIdentity(firmName);

        console.log(
            "Firm account loaded:",
            firmData
        );

        // Load public firm profile editor
        await loadPublicFirmProfile();
        // Load incoming lawyer applications
        await loadFirmApplications();

    } catch (error) {

        console.error(
            "Error loading firm account:",
            error
        );

        showToast(
            "Unable to load your firm account. Please refresh."
        );

    }

}


/* =========================================
   UPDATE FIRM IDENTITY
========================================= */

function updateFirmIdentity(firmName) {

    if (sidebarFirmName) {
        sidebarFirmName.textContent = firmName;
    }

    if (topbarFirmName) {
        topbarFirmName.textContent = firmName;
    }

    if (firmAvatar) {
        firmAvatar.textContent =
            firmName.charAt(0).toUpperCase();
    }

    document.title =
        `${firmName} | HakiLink Dashboard`;

}


/* =========================================
   LOAD PUBLIC FIRM PROFILE
========================================= */

async function loadPublicFirmProfile() {

    if (!currentUser || !firmProfileContent) {
        return;
    }

    try {

        firmProfileContent.innerHTML = `
            <div class="firm-profile-loading">
                Loading your firm profile...
            </div>
        `;

        const publicFirmRef = doc(
            db,
            "publicFirms",
            currentUser.uid
        );

        const publicFirmSnapshot =
            await getDoc(publicFirmRef);

        let publicData = {};

        if (publicFirmSnapshot.exists()) {

            publicData = publicFirmSnapshot.data();

        }

        // If no public profile exists yet,
        // use the firm name from registration.
        const initialFirmName =
            publicData.firmName ||
            currentFirmData.firmName ||
            "";

        renderFirmProfileForm(publicData, initialFirmName);

    } catch (error) {

        console.error(
            "Error loading public firm profile:",
            error
        );

        firmProfileContent.innerHTML = `
            <p class="profile-error">
                Unable to load your public firm profile.
                Please refresh and try again.
            </p>
        `;

        showToast(
            "Could not load your public firm profile."
        );

    }

}
/* =========================================
   LOAD LAWYER APPLICATIONS
========================================= */

async function loadFirmApplications() {

    if (!currentUser || !firmApplicationsList) {
        return;
    }

    try {

        firmApplicationsList.innerHTML = `
            <p>Loading lawyer applications...</p>
        `;

        // The firm ID must match the ID used
        // when the lawyer submitted the application.

        const applicationsQuery = query(
            collection(db, "firmApplications"),
            where("firmId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(applicationsQuery);

        firmApplications = snapshot.docs.map(documentSnapshot => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
        }));

        // Sort newest applications first.
        firmApplications.sort((a, b) => {
            const dateA = a.submittedAt?.toMillis?.() || 0;
            const dateB = b.submittedAt?.toMillis?.() || 0;

            return dateB - dateA;
        });

        updateApplicationStatistics();

        renderFirmApplications();

        console.log(
            "Firm applications loaded:",
            firmApplications
        );

    } catch (error) {

        console.error(
            "Error loading firm applications:",
            error
        );

        firmApplicationsList.innerHTML = `
            <p class="profile-error">
                Unable to load applications.
                Please check your permissions and try again.
            </p>
        `;

        showToast(
            "Could not load lawyer applications."
        );

    }

}


/* =========================================
   UPDATE APPLICATION STATISTICS
========================================= */

function updateApplicationStatistics() {

    const total = firmApplications.length;

    const pending = firmApplications.filter(
        application => application.status === "pending"
    ).length;

    const accepted = firmApplications.filter(
        application => application.status === "accepted"
    ).length;

    if (applicationCount) {
        applicationCount.textContent = pending;
    }

    if (totalApplications) {
        totalApplications.textContent = total;
    }

    if (pendingApplications) {
        pendingApplications.textContent = pending;
    }

    if (acceptedApplications) {
        acceptedApplications.textContent = accepted;
    }

}


/* =========================================
   RENDER FIRM APPLICATIONS
========================================= */

function renderFirmApplications() {

    if (!firmApplicationsList) return;

    if (firmApplications.length === 0) {

        firmApplicationsList.innerHTML = `
            <div class="dashboard-panel">
                <h3>No Applications Yet</h3>

                <p>
                    Applications from lawyers who want to join
                    your firm will appear here.
                </p>
            </div>
        `;

        return;
    }

    firmApplicationsList.innerHTML = firmApplications.map(application => {

        const lawyerName = escapeApplicationHTML(
            application.lawyerName || "Unnamed Lawyer"
        );

        const practiceArea = escapeApplicationHTML(
            application.practiceArea || "Not specified"
        );

        const status = escapeApplicationHTML(
            application.status || "pending"
        );

        const qualifications = escapeApplicationHTML(
            application.qualifications || "Not provided"
        );

        const experience = escapeApplicationHTML(
            application.experience || "Not provided"
        );

        const coverLetter = escapeApplicationHTML(
            application.coverLetter || "No cover letter provided."
        );

        const date = application.submittedAt?.toDate
            ? application.submittedAt.toDate().toLocaleDateString()
            : "Date unavailable";

        return `
            <div class="dashboard-panel application-card">

                <div class="application-header">

                    <div>
                        <h3>${lawyerName}</h3>

                        <p>
                            Practice Area: ${practiceArea}
                        </p>

                        <p>
                            Submitted: ${date}
                        </p>
                    </div>

                    <span class="application-status">
                        ${status.toUpperCase()}
                    </span>

                </div>

                <div class="application-details">

                    <h4>Qualifications</h4>
                    <p>${qualifications}</p>

                    <h4>Professional Experience</h4>
                    <p>${experience}</p>

                    <h4>Cover Letter</h4>
                    <p>${coverLetter}</p>

                </div>

                <div class="application-documents">

                    <h4>Supporting Documents</h4>

                    ${
                        Array.isArray(application.documents) &&
                        application.documents.length > 0
                            ? application.documents.map(document => `
                                <p>
                                    ${escapeApplicationHTML(
                                        document.fileName || document.name || "Uploaded document"
                                    )}
                                    <span>
                                        (${escapeApplicationHTML(
                                            document.type || document.documentType || "Document"
                                        )})
                                    </span>
                                </p>
                            `).join("")
                            : "<p>No document information available.</p>"
                    }

                </div>

            </div>
        `;

    }).join("");

}


/* =========================================
   ESCAPE USER-SUPPLIED CONTENT
========================================= */

function escapeApplicationHTML(value) {

    return String(value).replace(/[&<>"']/g, character => {

        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];

    });

}


/* =========================================
   RENDER FIRM PROFILE FORM
========================================= */

function renderFirmProfileForm(profileData, initialFirmName) {

    if (!firmProfileContent) return;

    firmProfileContent.innerHTML = `

        <style>

            .firm-profile-form {
                background: #FFFFFF;
                padding: 25px;
                border-radius: 12px;
                border: 1px solid #DCE3EA;
                max-width: 850px;
                box-shadow: 0 3px 12px rgba(0,0,0,0.04);
            }

            .firm-profile-form .form-group {
                margin-bottom: 20px;
            }

            .firm-profile-form label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: #10243A;
            }

            .firm-profile-form input,
            .firm-profile-form textarea {
                width: 100%;
                padding: 12px;
                border: 1px solid #DCE3EA;
                border-radius: 7px;
                font-size: 14px;
                font-family: inherit;
                box-sizing: border-box;
                outline: none;
            }

            .firm-profile-form input:focus,
            .firm-profile-form textarea:focus {
                border-color: #D9A928;
                box-shadow: 0 0 0 2px rgba(217,169,40,0.12);
            }

            .firm-profile-form textarea {
                resize: vertical;
                min-height: 110px;
            }

            .firm-profile-form .form-hint {
                display: block;
                color: #66788A;
                font-size: 12px;
                margin-top: 6px;
            }

            .firm-profile-form .save-profile-button {
                background: #0B2D52;
                color: #FFFFFF;
                border: none;
                padding: 13px 24px;
                border-radius: 7px;
                font-weight: 600;
                cursor: pointer;
            }

            .firm-profile-form .save-profile-button:hover {
                background: #061F36;
            }

            .firm-profile-form .save-profile-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .profile-status {
                margin-top: 15px;
                font-size: 13px;
                color: #66788A;
            }

            .profile-error {
                color: #B42318;
                padding: 15px;
            }

        </style>

        <form id="firmProfileForm" class="firm-profile-form">

            <div class="form-group">

                <label for="publicFirmName">
                    Law Firm Name *
                </label>

                <input
                    type="text"
                    id="publicFirmName"
                    maxlength="120"
                    placeholder="Enter your law firm's name"
                    required
                >

            </div>


            <div class="form-group">

                <label for="publicFirmLocation">
                    Firm Location *
                </label>

                <input
                    type="text"
                    id="publicFirmLocation"
                    maxlength="150"
                    placeholder="e.g. Nyeri, Kenya"
                    required
                >

            </div>


            <div class="form-group">

                <label for="publicFirmDescription">
                    About Your Firm *
                </label>

                <textarea
                    id="publicFirmDescription"
                    maxlength="2000"
                    placeholder="Describe your law firm, experience and services..."
                    required
                ></textarea>

                <span class="form-hint">
                    Maximum 2,000 characters.
                </span>

            </div>


            <div class="form-group">

                <label for="publicFirmPracticeAreas">
                    Practice Areas *
                </label>

                <input
                    type="text"
                    id="publicFirmPracticeAreas"
                    maxlength="500"
                    placeholder="e.g. Criminal Law, Family Law, Corporate Law"
                    required
                >

                <span class="form-hint">
                    Separate each practice area using a comma.
                </span>

            </div>


            <button
                type="submit"
                id="saveFirmProfileButton"
                class="save-profile-button"
            >
                Save Firm Profile
            </button>

            <p id="firmProfileStatus" class="profile-status">
                Your profile will be visible to authenticated HakiLink users.
            </p>

        </form>

    `;


    // Populate form fields safely

    document.getElementById("publicFirmName").value =
        initialFirmName;

    document.getElementById("publicFirmLocation").value =
        profileData.location || "";

    document.getElementById("publicFirmDescription").value =
        profileData.description || "";

    document.getElementById("publicFirmPracticeAreas").value =
        Array.isArray(profileData.practiceAreas)
            ? profileData.practiceAreas.join(", ")
            : "";


    // Attach form submission event

    const firmProfileForm =
        document.getElementById("firmProfileForm");

    firmProfileForm.addEventListener(
        "submit",
        saveFirmProfile
    );

}


/* =========================================
   SAVE FIRM PROFILE
========================================= */

async function saveFirmProfile(event) {

    event.preventDefault();

    if (!currentUser) {

        showToast("Please log in again.");

        return;
    }

    const firmName =
        document.getElementById("publicFirmName")
            .value.trim();

    const location =
        document.getElementById("publicFirmLocation")
            .value.trim();

    const description =
        document.getElementById("publicFirmDescription")
            .value.trim();

    const practiceAreasInput =
        document.getElementById("publicFirmPracticeAreas")
            .value.trim();


    // Convert comma-separated practice areas into an array

    const practiceAreas = [
        ...new Set(
            practiceAreasInput
                .split(",")
                .map(area => area.trim())
                .filter(area => area.length > 0)
        )
    ];


    // Basic validation

    if (
        !firmName ||
        !location ||
        !description ||
        practiceAreas.length === 0
    ) {

        showToast(
            "Please complete all firm profile fields."
        );

        return;
    }

    const saveButton =
        document.getElementById("saveFirmProfileButton");

    const statusMessage =
        document.getElementById("firmProfileStatus");

    saveButton.disabled = true;

    saveButton.textContent = "Saving...";

    statusMessage.textContent =
        "Saving your firm profile...";


    try {

        const publicFirmRef = doc(
            db,
            "publicFirms",
            currentUser.uid
        );

        const existingProfile =
            await getDoc(publicFirmRef);


        const profileData = {

            firmId: currentUser.uid,

            firmName: firmName,

            location: location,

            description: description,

            practiceAreas: practiceAreas

        };


        if (existingProfile.exists()) {

            // UPDATE EXISTING PUBLIC PROFILE
            // Keep original createdAt unchanged.

            await setDoc(
                publicFirmRef,
                {
                    ...profileData,
                    updatedAt: serverTimestamp()
                },
                { merge: true }
            );

        } else {

            // CREATE NEW PUBLIC PROFILE

            await setDoc(
                publicFirmRef,
                {
                    ...profileData,
                    createdAt: serverTimestamp()
                }
            );

        }


        // Update dashboard identity

        currentFirmData.firmName = firmName;

        updateFirmIdentity(firmName);


        statusMessage.textContent =
            "Your firm profile has been saved successfully.";

        showToast(
            "Firm profile saved successfully!"
        );

        saveButton.textContent = "Update Firm Profile";


        console.log(
            "Public firm profile saved:",
            profileData
        );

    } catch (error) {

        console.error(
            "Error saving firm profile:",
            error
        );

        statusMessage.textContent =
            "Unable to save your profile. Please try again.";

        showToast(
            "Profile saving failed: " + error.message
        );

    } finally {

        saveButton.disabled = false;

        if (
            saveButton.textContent === "Saving..."
        ) {
            saveButton.textContent = "Save Firm Profile";
        }

    }

}


/* =========================================
   FIREBASE AUTHENTICATION
========================================= */

onAuthStateChanged(auth, async (user) => {

    if (!user) {

        window.location.href = "../pages/login.html";

        return;
    }

    await loadFirmProfile(user);

});


/* =========================================
   LOGOUT
========================================= */

logoutButton?.addEventListener("click", async () => {

    try {

        await signOut(auth);

        window.location.href = "../pages/login.html";

    } catch (error) {

        console.error("Logout error:", error);

        showToast(
            "Unable to log out. Please try again."
        );

    }

});


/* =========================================
   ADD LAWYER BUTTON
========================================= */

addLawyerButton?.addEventListener("click", () => {

    showToast(
        "Lawyer management will be implemented next."
    );

});


/* =========================================
   TOAST NOTIFICATIONS
========================================= */

function showToast(message) {

    let toast = document.getElementById("firmToast");

    if (!toast) {

        toast = document.createElement("div");

        toast.id = "firmToast";

        Object.assign(toast.style, {

            position: "fixed",
            bottom: "25px",
            right: "25px",
            maxWidth: "350px",
            padding: "15px 20px",
            background: "#061F36",
            color: "#FFFFFF",
            borderLeft: "4px solid #D9A928",
            borderRadius: "8px",
            boxShadow: "0 5px 20px rgba(0,0,0,0.15)",
            fontSize: "13px",
            lineHeight: "1.5",
            zIndex: "9999"

        });

        document.body.appendChild(toast);

    }

    toast.textContent = message;

    toast.style.display = "block";

    clearTimeout(toast.hideTimer);

    toast.hideTimer = setTimeout(() => {

        toast.style.display = "none";

    }, 3500);

}


/* =========================================
   INITIAL DASHBOARD STATE
========================================= */

openSection("overview");
refreshApplicationsButton?.addEventListener(
    "click",
    loadFirmApplications
);