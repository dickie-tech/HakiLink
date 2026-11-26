
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
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================
   GET HTML ELEMENTS
========================================= */

const navLinks = document.querySelectorAll(".nav-link");
const dashboardSections = document.querySelectorAll(".dashboard-section");

const welcomeHeading = document.getElementById("welcomeHeading");
const addLawyerButton = document.getElementById("addLawyerButton");

const sidebarFirmName = document.getElementById("sidebarFirmName");
const topbarFirmName = document.getElementById("topbarFirmName");
const firmAvatar = document.getElementById("firmAvatar");

const logoutButton = document.getElementById("logoutButton");
const firmProfileContent = document.getElementById("firmProfileContent");

const menuButton = document.getElementById("menuButton");
const sidebar = document.getElementById("sidebar");

const firmApplicationsList = document.getElementById("firmApplicationsList");
const applicationCount = document.getElementById("applicationCount");
const totalApplications = document.getElementById("totalApplications");
const pendingApplications = document.getElementById("pendingApplications");
const acceptedApplications = document.getElementById("acceptedApplications");

const refreshApplicationsButton = document.getElementById(
    "refreshApplicationsButton"
);


/* =========================================
   GLOBAL STATE
========================================= */

let currentUser = null;
let currentFirmData = null;
let firmApplications = [];
let isReviewingApplication = false;


/* =========================================
   DASHBOARD NAVIGATION
========================================= */

function openSection(sectionId) {
    const targetSection = document.getElementById(sectionId);

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

    const sectionHeading = targetSection.querySelector("h2");

    if (welcomeHeading && sectionHeading) {
        welcomeHeading.textContent = sectionHeading.textContent;
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================================
   MOBILE SIDEBAR
========================================= */

function closeSidebar() {
    sidebar?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
}

function toggleSidebar() {
    if (!sidebar || !menuButton) return;

    const isOpen = sidebar.classList.toggle("open");

    menuButton.setAttribute("aria-expanded", String(isOpen));
}

menuButton?.addEventListener("click", event => {
    event.stopPropagation();
    toggleSidebar();
});

// One navigation listener per link.
navLinks.forEach(link => {
    link.addEventListener("click", () => {
        openSection(link.dataset.section);
        closeSidebar();
    });
});

// Close sidebar when clicking outside it.
document.addEventListener("click", event => {
    if (!sidebar || !menuButton) return;

    const clickedOutside =
        !sidebar.contains(event.target) &&
        !menuButton.contains(event.target);

    if (sidebar.classList.contains("open") && clickedOutside) {
        closeSidebar();
    }
});


/* =========================================
   KEYBOARD CONTROLS
========================================= */

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeSidebar();
        closeApplicationModal();
    }
});


/* =========================================
   LOAD FIRM ACCOUNT
========================================= */

async function loadFirmProfile(user) {
    try {
        const firmRef = doc(db, "users", user.uid);
        const firmSnapshot = await getDoc(firmRef);

        if (!firmSnapshot.exists()) {
            showToast("Your law firm account could not be found.");
            return;
        }

        const firmData = firmSnapshot.data();

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

        const firmName = firmData.firmName || "Law Firm";

        updateFirmIdentity(firmName);

        console.log("Firm account loaded:", firmData);

        await loadPublicFirmProfile();
        await loadFirmApplications();

    } catch (error) {
        console.error("Error loading firm account:", error);

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
        firmAvatar.textContent = firmName.charAt(0).toUpperCase();
    }

    document.title = `${firmName} | HakiLink Dashboard`;
}


/* =========================================
   LOAD PUBLIC FIRM PROFILE
========================================= */

async function loadPublicFirmProfile() {
    if (!currentUser || !firmProfileContent) return;

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

        const publicFirmSnapshot = await getDoc(publicFirmRef);

        const publicData = publicFirmSnapshot.exists()
            ? publicFirmSnapshot.data()
            : {};

        const initialFirmName =
            publicData.firmName ||
            currentFirmData.firmName ||
            "";

        renderFirmProfileForm(publicData, initialFirmName);

    } catch (error) {
        console.error("Error loading public firm profile:", error);

        firmProfileContent.innerHTML = `
            <p class="profile-error">
                Unable to load your firm profile. Please refresh and try again.
            </p>
        `;

        showToast("Could not load your public firm profile.");
    }
}


/* =========================================
   LOAD LAWYER APPLICATIONS
========================================= */

async function loadFirmApplications() {
    if (!currentUser || !firmApplicationsList) return;

    try {
        firmApplicationsList.innerHTML = `
            <p>Loading lawyer applications...</p>
        `;

        const applicationsQuery = query(
            collection(db, "firmApplications"),
            where("firmId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(applicationsQuery);

        firmApplications = snapshot.docs.map(documentSnapshot => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
        }));

        // Newest applications first.
        firmApplications.sort((a, b) => {
            const dateA = a.submittedAt?.toMillis?.() || 0;
            const dateB = b.submittedAt?.toMillis?.() || 0;

            return dateB - dateA;
        });

        updateApplicationStatistics();
        renderFirmApplications();

        console.log("Firm applications loaded:", firmApplications);

    } catch (error) {
        console.error("Error loading firm applications:", error);

        firmApplicationsList.innerHTML = `
            <p class="profile-error">
                Unable to load applications.
                Please check your permissions and try again.
            </p>
        `;

        showToast("Could not load lawyer applications.");
    }
}


/* =========================================
   APPLICATION STATISTICS
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
   SAFE HTML ESCAPING
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
   RENDER APPLICATION LIST
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

        const status = ["pending", "accepted", "declined", "withdrawn"]
            .includes(application.status)
            ? application.status
            : "pending";

        const safeId = escapeApplicationHTML(application.id);

        return `
            <div class="dashboard-panel application-list-item">

                <button
                    type="button"
                    class="applicant-name-button"
                    data-application-id="${safeId}"
                >
                    ${lawyerName}
                </button>

                <span class="application-status status-${status}">
                    ${status.toUpperCase()}
                </span>

            </div>
        `;
    }).join("");
}


/* =========================================
   APPLICATION MODAL STYLES AND CREATION
========================================= */

function createApplicationModal() {
    if (document.getElementById("applicationDetailsModal")) {
        return;
    }

    const modalStyles = document.createElement("style");

    modalStyles.textContent = `
        .application-list-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
            padding: 18px 22px;
            margin-bottom: 12px;
        }

        .applicant-name-button {
            background: none;
            border: none;
            padding: 0;
            color: #0B2D52;
            font-size: 16px;
            font-weight: 700;
            font-family: inherit;
            text-align: left;
            cursor: pointer;
        }

        .applicant-name-button:hover {
            color: #D9A928;
            text-decoration: underline;
        }

        .application-status {
            display: inline-block;
            padding: 7px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
        }

        .status-pending {
            background: #FFF3CD;
            color: #856404;
        }

        .status-accepted {
            background: #D1FADF;
            color: #027A48;
        }

        .status-declined {
            background: #FEE4E2;
            color: #B42318;
        }

        .status-withdrawn {
            background: #EAECF0;
            color: #475467;
        }

        .application-modal-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(6, 31, 54, 0.7);
            z-index: 10000;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        }

        .application-modal-overlay.active {
            display: flex;
        }

        .application-modal {
            background: #FFFFFF;
            width: 100%;
            max-width: 750px;
            max-height: 90vh;
            overflow-y: auto;
            border-radius: 14px;
            box-shadow: 0 15px 50px rgba(0,0,0,0.2);
        }

        .application-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
            padding: 22px 25px;
            background: #0B2D52;
            color: #FFFFFF;
            border-radius: 14px 14px 0 0;
        }

        .application-modal-header h2 {
            margin: 0;
            font-size: 20px;
        }

        .application-modal-close {
            background: transparent;
            border: none;
            color: #FFFFFF;
            font-size: 27px;
            cursor: pointer;
            line-height: 1;
        }

        .application-modal-body {
            padding: 25px;
        }

        .application-modal-body h3,
        .application-modal-body h4 {
            color: #0B2D52;
        }

        .application-modal-body h3 {
            margin: 0 0 8px;
        }

        .application-modal-body h4 {
            margin: 22px 0 7px;
        }

        .application-modal-body p {
            color: #66788A;
            line-height: 1.7;
            overflow-wrap: anywhere;
        }

        .application-modal-section {
            padding-bottom: 15px;
            border-bottom: 1px solid #DCE3EA;
        }

        .application-modal-documents {
            background: #F5F7FA;
            padding: 15px;
            border-radius: 8px;
            margin-top: 18px;
        }

        .application-modal-actions {
            display: flex;
            gap: 12px;
            margin-top: 25px;
            flex-wrap: wrap;
        }

        .application-modal-actions button {
            padding: 12px 20px;
            border-radius: 7px;
            font-weight: 600;
            cursor: pointer;
            border: none;
        }

        .application-modal-actions button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .modal-accept-button {
            background: #0B2D52;
            color: white;
        }

        .modal-decline-button {
            background: #FFFFFF;
            color: #B42318;
            border: 1px solid #B42318 !important;
        }

        .modal-close-button {
            background: #EAECF0;
            color: #344054;
            margin-left: auto;
        }

        @media (max-width: 600px) {
            .application-modal-overlay {
                padding: 10px;
            }

            .application-modal-body {
                padding: 18px;
            }

            .application-modal-header {
                padding: 18px;
            }

            .application-modal-actions {
                flex-direction: column;
            }

            .application-modal-actions button {
                width: 100%;
            }

            .modal-close-button {
                margin-left: 0;
            }
        }
    `;

    document.head.appendChild(modalStyles);

    const modal = document.createElement("div");

    modal.id = "applicationDetailsModal";
    modal.className = "application-modal-overlay";

    modal.innerHTML = `
        <div class="application-modal" role="dialog" aria-modal="true"
             aria-labelledby="applicationModalTitle">

            <div class="application-modal-header">

                <h2 id="applicationModalTitle">
                    Lawyer Application Details
                </h2>

                <button
                    type="button"
                    class="application-modal-close"
                    id="closeApplicationModal"
                    aria-label="Close application details"
                >
                    &times;
                </button>

            </div>

            <div
                class="application-modal-body"
                id="applicationModalContent"
            ></div>

        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("closeApplicationModal")
        .addEventListener("click", closeApplicationModal);

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeApplicationModal();
        }
    });
}


/* =========================================
   OPEN APPLICATION DETAILS
========================================= */

function openApplicationDetails(applicationId) {
    const application = firmApplications.find(
        item => item.id === applicationId
    );

    if (!application) {
        showToast("Application could not be found.");
        return;
    }

    createApplicationModal();

    const modal = document.getElementById("applicationDetailsModal");
    const modalContent = document.getElementById("applicationModalContent");

    const lawyerName = escapeApplicationHTML(
        application.lawyerName || "Unnamed Lawyer"
    );

    const practiceArea = escapeApplicationHTML(
        application.practiceArea || "Not specified"
    );

    const barNumber = escapeApplicationHTML(
        application.barAdmissionNumber || "Not provided"
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

    const status = ["pending", "accepted", "declined", "withdrawn"]
        .includes(application.status)
        ? application.status
        : "pending";

    const date = application.submittedAt?.toDate
        ? application.submittedAt.toDate().toLocaleDateString()
        : "Date unavailable";

    const documents = Array.isArray(application.documents)
        ? application.documents
        : [];

    const documentsHTML = documents.length > 0
        ? documents.map(document => `
            <p>
                <strong>
                    ${escapeApplicationHTML(
                        document.fileName ||
                        document.name ||
                        "Uploaded document"
                    )}
                </strong>

                <span>
                    (${escapeApplicationHTML(
                        document.type ||
                        document.documentType ||
                        "Document"
                    )})
                </span>
            </p>
        `).join("")
        : "<p>No supporting documents available.</p>";

    let actionButtons = "";

    if (status === "pending") {
        actionButtons = `
            <div class="application-modal-actions">

                <button
                    type="button"
                    class="modal-accept-button"
                    data-application-id="${escapeApplicationHTML(application.id)}"
                >
                    Accept Application
                </button>

                <button
                    type="button"
                    class="modal-decline-button"
                    data-application-id="${escapeApplicationHTML(application.id)}"
                >
                    Decline Application
                </button>

                <button
                    type="button"
                    class="modal-close-button"
                    id="modalBottomCloseButton"
                >
                    Close
                </button>

            </div>
        `;
    } else {
        actionButtons = `
            <div class="application-modal-actions">

                <p>This application has already been reviewed.</p>

                <button
                    type="button"
                    class="modal-close-button"
                    id="modalBottomCloseButton"
                >
                    Close
                </button>

            </div>
        `;
    }

    modalContent.innerHTML = `
        <div class="application-modal-section">

            <h3>${lawyerName}</h3>

            <span class="application-status status-${status}">
                ${status.toUpperCase()}
            </span>

            <p>
                <strong>Submitted:</strong> ${escapeApplicationHTML(date)}
            </p>

        </div>

        <div class="application-modal-section">

            <h4>Practice Area</h4>
            <p>${practiceArea}</p>

            <h4>Bar Admission Number</h4>
            <p>${barNumber}</p>

        </div>

        <div class="application-modal-section">

            <h4>Qualifications</h4>
            <p>${qualifications}</p>

            <h4>Professional Experience</h4>
            <p>${experience}</p>

        </div>

        <div class="application-modal-section">

            <h4>Cover Letter</h4>
            <p>${coverLetter}</p>

        </div>

        <div class="application-modal-documents">

            <h4>Supporting Documents</h4>

            ${documentsHTML}

        </div>

        ${actionButtons}
    `;

    document.getElementById("modalBottomCloseButton")
        ?.addEventListener("click", closeApplicationModal);

    modalContent.querySelector(".modal-accept-button")
        ?.addEventListener("click", async event => {
            const id = event.currentTarget.dataset.applicationId;
            await reviewFirmApplication(id, "accepted");
        });

    modalContent.querySelector(".modal-decline-button")
        ?.addEventListener("click", async event => {
            const id = event.currentTarget.dataset.applicationId;
            await reviewFirmApplication(id, "declined");
        });

    modal.classList.add("active");
    document.body.style.overflow = "hidden";
}


/* =========================================
   CLOSE APPLICATION MODAL
========================================= */

function closeApplicationModal() {
    const modal = document.getElementById("applicationDetailsModal");

    if (modal) {
        modal.classList.remove("active");
    }

    document.body.style.overflow = "";
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
                <label for="publicFirmName">Law Firm Name *</label>
                <input
                    type="text"
                    id="publicFirmName"
                    maxlength="120"
                    placeholder="Enter your law firm's name"
                    required
                >
            </div>

            <div class="form-group">
                <label for="publicFirmLocation">Firm Location *</label>
                <input
                    type="text"
                    id="publicFirmLocation"
                    maxlength="150"
                    placeholder="e.g. Nyeri, Kenya"
                    required
                >
            </div>

            <div class="form-group">
                <label for="publicFirmDescription">About Your Firm *</label>
                <textarea
                    id="publicFirmDescription"
                    maxlength="2000"
                    placeholder="Describe your law firm, experience and services..."
                    required
                ></textarea>
                <span class="form-hint">Maximum 2,000 characters.</span>
            </div>

            <div class="form-group">
                <label for="publicFirmPracticeAreas">Practice Areas *</label>
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

    document.getElementById("publicFirmName").value = initialFirmName;

    document.getElementById("publicFirmLocation").value =
        profileData.location || "";

    document.getElementById("publicFirmDescription").value =
        profileData.description || "";

    document.getElementById("publicFirmPracticeAreas").value =
        Array.isArray(profileData.practiceAreas)
            ? profileData.practiceAreas.join(", ")
            : "";

    document.getElementById("firmProfileForm")
        .addEventListener("submit", saveFirmProfile);
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

    const firmName = document.getElementById("publicFirmName")
        .value.trim();

    const location = document.getElementById("publicFirmLocation")
        .value.trim();

    const description = document.getElementById("publicFirmDescription")
        .value.trim();

    const practiceAreasInput = document.getElementById(
        "publicFirmPracticeAreas"
    ).value.trim();

    const practiceAreas = [
        ...new Set(
            practiceAreasInput
                .split(",")
                .map(area => area.trim())
                .filter(area => area.length > 0)
        )
    ];

    if (!firmName || !location || !description || practiceAreas.length === 0) {
        showToast("Please complete all firm profile fields.");
        return;
    }

    const saveButton = document.getElementById("saveFirmProfileButton");
    const statusMessage = document.getElementById("firmProfileStatus");

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    statusMessage.textContent = "Saving your firm profile...";

    try {
        const publicFirmRef = doc(db, "publicFirms", currentUser.uid);
        const existingProfile = await getDoc(publicFirmRef);

        const profileData = {
            firmId: currentUser.uid,
            firmName,
            location,
            description,
            practiceAreas
        };

        if (existingProfile.exists()) {
            await setDoc(
                publicFirmRef,
                {
                    ...profileData,
                    updatedAt: serverTimestamp()
                },
                { merge: true }
            );
        } else {
            await setDoc(publicFirmRef, {
                ...profileData,
                createdAt: serverTimestamp()
            });
        }

        currentFirmData.firmName = firmName;
        updateFirmIdentity(firmName);

        statusMessage.textContent =
            "Your firm profile has been saved successfully.";

        saveButton.textContent = "Update Firm Profile";

        showToast("Firm profile saved successfully!");

    } catch (error) {
        console.error("Error saving firm profile:", error);

        statusMessage.textContent =
            "Unable to save your profile. Please try again.";

        showToast("Profile saving failed: " + error.message);

    } finally {
        saveButton.disabled = false;

        if (saveButton.textContent === "Saving...") {
            saveButton.textContent = "Save Firm Profile";
        }
    }
}


/* =========================================
   REVIEW LAWYER APPLICATION
========================================= */

async function reviewFirmApplication(applicationId, decision) {
    if (!currentUser || !currentFirmData) {
        showToast("Please log in again.");
        return;
    }

    if (isReviewingApplication) return;

    const application = firmApplications.find(
        item => item.id === applicationId
    );

    if (!application) {
        showToast("Application could not be found.");
        return;
    }

    if (application.status !== "pending") {
        showToast("This application has already been reviewed.");
        return;
    }

    if (!["accepted", "declined"].includes(decision)) {
        return;
    }

    let decisionNote = "";

    if (decision === "accepted") {
        const confirmed = confirm(
            `Are you sure you want to accept ${application.lawyerName}?`
        );

        if (!confirmed) return;

    } else {
        decisionNote = prompt(
            "Enter a reason for declining this application:"
        );

        if (decisionNote === null) return;

        decisionNote = decisionNote.trim();

        if (!decisionNote) {
            showToast("Please provide a reason for declining.");
            return;
        }
    }

    try {
        isReviewingApplication = true;

        const actionButtons = document.querySelectorAll(
            ".modal-accept-button, .modal-decline-button"
        );

        actionButtons.forEach(button => {
            button.disabled = true;
            button.textContent = "Processing...";
        });

        showToast("Processing application decision...");

        const batch = writeBatch(db);

        const applicationRef = doc(
            db,
            "firmApplications",
            applicationId
        );

        const updateData = {
            status: decision,
            reviewedAt: serverTimestamp()
        };

        if (decisionNote) {
            updateData.decisionNote = decisionNote;
        }

        batch.update(applicationRef, updateData);

        // Create firm-lawyer affiliation atomically with acceptance.
        if (decision === "accepted") {
            const affiliationId =
                `${application.firmId}_${application.lawyerId}`;

            const affiliationRef = doc(
                db,
                "firmLawyers",
                affiliationId
            );

            batch.set(affiliationRef, {
                firmId: application.firmId,
                lawyerId: application.lawyerId,
                applicationId,
                status: "active",
                joinedAt: serverTimestamp()
            });
        }

        await batch.commit();

        closeApplicationModal();

        showToast(
            decision === "accepted"
                ? "Lawyer successfully accepted!"
                : "Application declined successfully."
        );

        await loadFirmApplications();

    } catch (error) {
        console.error("Application review error:", error);

        showToast(
            "Unable to process application: " + error.message
        );

        // Re-enable buttons if the operation failed.
        document.querySelectorAll(
            ".modal-accept-button, .modal-decline-button"
        ).forEach(button => {
            button.disabled = false;
            button.textContent = button.classList.contains(
                "modal-accept-button"
            )
                ? "Accept Application"
                : "Decline Application";
        });

    } finally {
        isReviewingApplication = false;
    }
}


/* =========================================
   APPLICATION LIST CLICK EVENTS
========================================= */

firmApplicationsList?.addEventListener("click", event => {
    const applicantButton = event.target.closest(
        ".applicant-name-button"
    );

    if (!applicantButton) return;

    const applicationId = applicantButton.dataset.applicationId;

    openApplicationDetails(applicationId);
});


/* =========================================
   FIREBASE AUTHENTICATION
========================================= */

onAuthStateChanged(auth, async user => {
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
        showToast("Unable to log out. Please try again.");
    }
});


/* =========================================
   ADD LAWYER BUTTON
========================================= */

addLawyerButton?.addEventListener("click", () => {
    showToast("Lawyer management will be implemented next.");
});


/* =========================================
   REFRESH APPLICATIONS
========================================= */

refreshApplicationsButton?.addEventListener("click", () => {
    loadFirmApplications();
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
            zIndex: "11000"
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
