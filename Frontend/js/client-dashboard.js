
/* ============================================
   HAKILINK CLIENT DASHBOARD
   Client profile, lawyer directory and
   consultation requests using Firebase
============================================ */

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc,
    collection,
    addDoc,
    serverTimestamp,
    getDocs,
    query,
    where
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

const lawyersGrid = document.getElementById("lawyersGrid");
const lawyerSearch = document.getElementById("lawyerSearch");
const practiceFilter = document.getElementById("practiceFilter");

// Consultation request modal
const consultationModal = document.getElementById("consultationModal");
const consultationForm = document.getElementById("consultationForm");
const selectedLawyerName = document.getElementById("selectedLawyerName");
const consultationSubject = document.getElementById("consultationSubject");
const consultationDescription = document.getElementById("consultationDescription");
const consultationFormMessage = document.getElementById("consultationFormMessage");
const submitConsultationRequest = document.getElementById("submitConsultationRequest");
const closeConsultationModal = document.getElementById("closeConsultationModal");

// Requests section
const requestsCard = document.querySelector("#requests .requests-card");


// ============================================
// APPLICATION STATE
// ============================================

let currentClient = null;
let currentClientName = "";
let selectedLawyer = null;
let lawyers = [];
let clientRequests = [];


// ============================================
// HELPER FUNCTIONS
// ============================================

function getInitials(name) {
    if (!name || typeof name !== "string") {
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


function formatDate(timestamp) {
    if (!timestamp) {
        return "Date unavailable";
    }

    try {
        const date = timestamp.toDate
            ? timestamp.toDate()
            : new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleString("en-KE", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch (error) {
        return "Date unavailable";
    }
}


function formatStatus(status) {
    const labels = {
        pending: "Pending",
        accepted: "Accepted",
        declined: "Declined",
        scheduled: "Scheduled",
        completed: "Completed",
        cancelled: "Cancelled"
    };

    return labels[status] || "Pending";
}


function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined && text !== null) {
        element.textContent = text;
    }

    return element;
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

        currentClient = user;

        currentClientName =
            userData.fullName ||
            user.displayName ||
            "HakiLink Client";

        const email = userData.email || user.email || "No email";
        const phone = userData.phone || "Not provided";

        if (welcomeName) {
            welcomeName.textContent = currentClientName;
        }

        if (topbarUserName) {
            topbarUserName.textContent = currentClientName;
        }

        if (profileName) {
            profileName.textContent = currentClientName;
        }

        if (profileFullName) {
            profileFullName.textContent = currentClientName;
        }

        if (profileEmail) {
            profileEmail.textContent = email;
        }

        if (profilePhone) {
            profilePhone.textContent = phone;
        }

        const initials = getInitials(currentClientName);

        if (userAvatar) {
            userAvatar.textContent = initials;
        }

        if (profileAvatar) {
            profileAvatar.textContent = initials;
        }

        // Warn if the logged-in account is not a client.
        if (userData.role && userData.role !== "client") {
            console.warn(
                "This account is not registered as a client."
            );
        }

    } catch (error) {
        console.error("Error loading client profile:", error);
    }
}


// ============================================
// LOAD LAWYERS FROM FIRESTORE
// ============================================

async function loadLawyers() {
    if (!lawyersGrid) {
        return;
    }

    lawyersGrid.textContent = "Loading lawyers...";

    try {
        const lawyersCollection = collection(db, "publicLawyers");
        const snapshot = await getDocs(lawyersCollection);

        lawyers = snapshot.docs
            .map((document) => ({
                id: document.id,
                ...document.data()
            }))
            .filter((lawyer) =>
                typeof lawyer.fullName === "string" &&
                typeof lawyer.practiceArea === "string"
            );

        renderLawyers();

    } catch (error) {
        console.error("Error loading lawyers:", error);

        lawyersGrid.textContent =
            "We couldn't load lawyers right now. Please try again later.";
    }
}


// ============================================
// DISPLAY LAWYER CARDS
// ============================================

function renderLawyers() {
    if (!lawyersGrid) {
        return;
    }

    const searchTerm = lawyerSearch
        ? lawyerSearch.value.trim().toLowerCase()
        : "";

    const selectedPractice = practiceFilter
        ? practiceFilter.value.trim().toLowerCase()
        : "";

    const filteredLawyers = lawyers.filter((lawyer) => {
        const name = lawyer.fullName.toLowerCase();
        const area = lawyer.practiceArea.toLowerCase();

        const matchesSearch =
            name.includes(searchTerm) ||
            area.includes(searchTerm);

        const matchesPractice =
            !selectedPractice ||
            selectedPractice === area;

        // Do not show the current client as a lawyer.
        const isNotCurrentClient =
            !currentClient ||
            lawyer.id !== currentClient.uid;

        return (
            matchesSearch &&
            matchesPractice &&
            isNotCurrentClient
        );
    });

    lawyersGrid.replaceChildren();

    if (filteredLawyers.length === 0) {
        const emptyMessage = createElement(
            "p",
            "lawyers-empty",
            lawyers.length === 0
                ? "No lawyers are listed yet. Please check back soon."
                : "No lawyers match your search. Try another name or practice area."
        );

        lawyersGrid.appendChild(emptyMessage);
        return;
    }

    filteredLawyers.forEach((lawyer) => {
        const card = createElement("article", "lawyer-card");

        const avatar = createElement(
            "div",
            "lawyer-avatar",
            getInitials(lawyer.fullName)
        );

        const name = createElement(
            "h3",
            "lawyer-name",
            lawyer.fullName
        );

        const specialty = createElement(
            "p",
            "lawyer-specialty",
            lawyer.practiceArea
        );

        const description = createElement(
            "p",
            "lawyer-description",
            "Legal professional listed on HakiLink."
        );

        const requestButton = createElement(
            "button",
            "request-consultation-button",
            "Request Consultation"
        );

        requestButton.type = "button";

        requestButton.addEventListener("click", () => {
            openConsultationModal(lawyer);
        });

        card.append(
            avatar,
            name,
            specialty,
            description,
            requestButton
        );

        lawyersGrid.appendChild(card);
    });
}


// ============================================
// OPEN CONSULTATION REQUEST MODAL
// ============================================

function openConsultationModal(lawyer) {
    if (!currentClient) {
        alert("Please log in to request a consultation.");
        return;
    }

    if (
        !consultationModal ||
        !consultationForm ||
        !selectedLawyerName ||
        !consultationFormMessage ||
        !consultationSubject
    ) {
        console.error(
            "Consultation modal elements are missing from client-dashboard.html."
        );

        alert(
            "The consultation form is not available. Please check the dashboard HTML."
        );

        return;
    }

    // The document ID in publicLawyers must be the lawyer's Auth UID.
    selectedLawyer = {
        ...lawyer,
        uid: lawyer.uid || lawyer.id
    };

    selectedLawyerName.textContent = lawyer.fullName;

    consultationForm.reset();
    consultationFormMessage.textContent = "";

    consultationModal.hidden = false;
    consultationSubject.focus();
}


// ============================================
// CLOSE CONSULTATION REQUEST MODAL
// ============================================

function closeRequestModal() {
    if (!consultationModal) {
        return;
    }

    consultationModal.hidden = true;
    selectedLawyer = null;

    if (consultationFormMessage) {
        consultationFormMessage.textContent = "";
    }
}


if (closeConsultationModal) {
    closeConsultationModal.addEventListener(
        "click",
        closeRequestModal
    );
}


if (consultationModal) {
    consultationModal.addEventListener("click", (event) => {
        if (event.target === consultationModal) {
            closeRequestModal();
        }
    });
}


document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        consultationModal &&
        !consultationModal.hidden
    ) {
        closeRequestModal();
    }
});


// ============================================
// SUBMIT CONSULTATION REQUEST
// ============================================

if (consultationForm) {
    consultationForm.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            if (!currentClient || !selectedLawyer) {
                if (consultationFormMessage) {
                    consultationFormMessage.textContent =
                        "Please sign in and select a lawyer first.";
                }

                return;
            }

            const subject = consultationSubject.value.trim();
            const description =
                consultationDescription.value.trim();

            if (!subject || !description) {
                consultationFormMessage.textContent =
                    "Please complete both fields.";

                return;
            }

            if (subject.length > 120 || description.length > 3000) {
                consultationFormMessage.textContent =
                    "Your subject or description is too long.";

                return;
            }

            submitConsultationRequest.disabled = true;
            submitConsultationRequest.textContent = "Submitting...";

            try {
                const lawyerId = selectedLawyer.uid;

                if (!lawyerId) {
                    throw new Error(
                        "The selected lawyer does not have a valid UID."
                    );
                }

                await addDoc(
                    collection(db, "consultationRequests"),
                    {
                        lawyerId,
                        clientId: currentClient.uid,
                        clientName: currentClientName,
                        subject,
                        description,
                        status: "pending",
                        requestedAt: serverTimestamp()
                    }
                );

                consultationFormMessage.textContent =
                    "Request submitted successfully!";

                // Refresh the client's request list and statistics.
                await loadClientRequests();

                // Close the form after a successful submission.
                setTimeout(() => {
                    closeRequestModal();
                }, 1000);

            } catch (error) {
                console.error(
                    "Consultation request error:",
                    error
                );

                consultationFormMessage.textContent =
                    error.code === "permission-denied"
                        ? "Permission denied. Please check your Firestore security rules."
                        : "Could not submit your request. Please try again.";
            } finally {
                submitConsultationRequest.disabled = false;
                submitConsultationRequest.textContent =
                    "Submit Request →";
            }
        }
    );
}


// ============================================
// LOAD THE CLIENT'S CONSULTATION REQUESTS
// ============================================

async function loadClientRequests() {
    if (!requestsCard || !currentClient) {
        return;
    }

    try {
        const requestsQuery = query(
            collection(db, "consultationRequests"),
            where("clientId", "==", currentClient.uid)
        );

        const snapshot = await getDocs(requestsQuery);

        clientRequests = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
        }));

        clientRequests.sort((a, b) => {
            const dateA = a.requestedAt?.toMillis?.() || 0;
            const dateB = b.requestedAt?.toMillis?.() || 0;

            return dateB - dateA;
        });

        // Update dashboard statistics.
        const activeRequests = clientRequests.filter(
            (request) =>
                ["pending", "accepted"].includes(request.status)
        ).length;

        const activeRequestsElement =
            document.getElementById("activeRequests");

        const consultationsElement =
            document.getElementById("consultations");

        if (activeRequestsElement) {
            activeRequestsElement.textContent = activeRequests;
        }

        if (consultationsElement) {
            consultationsElement.textContent =
                clientRequests.filter(
                    (request) => request.status === "accepted"
                ).length;
        }

        // Render the request cards.
        requestsCard.replaceChildren();

        if (clientRequests.length === 0) {
            const empty = createElement("div", "empty-state");

            const heading = createElement(
                "h3",
                "",
                "No legal requests yet"
            );

            const paragraph = createElement(
                "p",
                "",
                "When you request assistance from a lawyer, your requests will appear here."
            );

            const link = createElement(
                "a",
                "secondary-button",
                "Find a Lawyer"
            );

            link.href = "#find-lawyer";

            empty.append(heading, paragraph, link);
            requestsCard.appendChild(empty);

            return;
        }

        clientRequests.forEach((request) => {
            const card = createElement(
                "article",
                "client-request-card"
            );

            const heading = createElement(
                "h3",
                "",
                request.subject || "Consultation request"
            );

            const status = createElement(
                "span",
                `request-status status-${request.status || "pending"}`,
                formatStatus(request.status)
            );

            const description = createElement(
                "p",
                "request-description",
                request.description || "No description provided."
            );

            const lawyerName = lawyers.find(
                (lawyer) =>
                    lawyer.id === request.lawyerId ||
                    lawyer.uid === request.lawyerId
            )?.fullName;

            const lawyer = createElement(
                "p",
                "request-lawyer",
                `Lawyer: ${lawyerName || "HakiLink legal professional"}`
            );

            const date = createElement(
                "p",
                "request-date",
                `Submitted: ${formatDate(request.requestedAt)}`
            );

            const details = createElement(
                "div",
                "client-request-details"
            );

            details.append(
                status,
                lawyer,
                date
            );

           
            card.append(
                heading,
                description,
                details
            );

            // Show the lawyer's feedback when one has been provided.
            if (
                typeof request.lawyerFeedback === "string" &&
                request.lawyerFeedback.trim()
            ) {
                const feedbackBox = createElement(
                    "div",
                    "lawyer-feedback"
                );

                const feedbackHeading = createElement(
                    "h4",
                    "",
                    "Lawyer's Feedback"
                );

                const feedbackMessage = createElement(
                    "p",
                    "",
                    request.lawyerFeedback
                );

                feedbackBox.append(
                    feedbackHeading,
                    feedbackMessage
                );

                card.appendChild(feedbackBox);
            }

            requestsCard.appendChild(card);

        });

    } catch (error) {
        console.error(
            "Could not load client consultation requests:",
            error
        );

        requestsCard.replaceChildren(
            createElement(
                "p",
                "empty-state",
                "Your requests could not be loaded. Please refresh the page and try again."
            )
        );
    }
}


// ============================================
// SEARCH AND PRACTICE-AREA FILTERS
// ============================================

if (lawyerSearch) {
    lawyerSearch.addEventListener("input", renderLawyers);
}

if (practiceFilter) {
    practiceFilter.addEventListener("change", renderLawyers);
}


// ============================================
// CLIENT DASHBOARD NAVIGATION
// ============================================

document.querySelectorAll(".sidebar-nav a").forEach((link) => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".sidebar-nav a").forEach((item) => {
            item.classList.remove("active");
        });

        link.classList.add("active");

        // Scroll to the selected dashboard section.
        const href = link.getAttribute("href");

        if (href && href.startsWith("#") && href.length > 1) {
            const section = document.querySelector(href);

            if (section) {
                section.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        }
    });
});

async function loadClientAppointments(user) {
    const appointmentsList = document.getElementById("clientAppointmentsList");
    const appointmentCount = document.getElementById("appointmentNavCount");

    if (!appointmentsList) return;

    appointmentsList.innerHTML = `
        <div class="empty-state">
            <h3>Loading appointments...</h3>
        </div>
    `;

    try {
        const appointmentsQuery = query(
            collection(db, "appointments"),
            where("clientId", "==", user.uid)
        );

        const snapshot = await getDocs(appointmentsQuery);

        const appointments = snapshot.docs.map((appointmentDoc) => ({
            id: appointmentDoc.id,
            ...appointmentDoc.data()
        }));

        appointments.sort((a, b) => {
            const dateA = a.dateTime?.toMillis?.() ?? 0;
            const dateB = b.dateTime?.toMillis?.() ?? 0;
            return dateA - dateB;
        });

        if (appointmentCount) {
            appointmentCount.textContent = appointments.length;
        }

        if (appointments.length === 0) {
            appointmentsList.innerHTML = `
                <div class="empty-state">
                    <h3>No appointments yet</h3>
                    <p>Appointments scheduled by your lawyers will appear here.</p>
                </div>
            `;
            return;
        }

        appointmentsList.innerHTML = "";

        appointments.forEach((appointment) => {
            const lawyer = lawyers.find(
                (item) => item.id === appointment.lawyerId
            );

            const appointmentDate = appointment.dateTime?.toDate
                ? appointment.dateTime.toDate().toLocaleString()
                : "Date not available";

            const card = document.createElement("div");
            card.className = "appointment-card";

            const title = document.createElement("h3");
            title.textContent = appointment.title || "Client consultation";

            const lawyerName = document.createElement("p");
            lawyerName.textContent =
                `Lawyer: ${lawyer?.fullName || "Your lawyer"}`;

            const date = document.createElement("p");
            date.textContent = `Date and time: ${appointmentDate}`;

            const status = document.createElement("p");
            status.textContent =
                `Status: ${appointment.status || "Scheduled"}`;

            card.append(title, lawyerName, date, status);
            appointmentsList.appendChild(card);
        });

    } catch (error) {
        console.error("Error loading client appointments:", error);

        appointmentsList.innerHTML = `
            <div class="empty-state">
                <h3>Unable to load appointments</h3>
                <p>Please refresh the page and try again.</p>
            </div>
        `;
    }
}
// ============================================
// AUTHENTICATION STATE
// ============================================

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        currentClient = null;
        window.location.href = "../pages/login.html";
        return;
    }

    await loadClientProfile(user);

    if (!currentClient) {
        return;
    }

    // Load the lawyer directory and the client's requests.
    await Promise.all([
        loadLawyers(),
        loadClientRequests(),
        loadClientAppointments(user)
    ]);
});


// ============================================
// LOGOUT
// ============================================

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = "../pages/login.html";
        } catch (error) {
            console.error("Logout error:", error);

            alert("Unable to log out. Please try again.");
        }
    });
}
// ============================================
// MOBILE HAMBURGER MENU
// ============================================

const menuButton = document.getElementById("menuButton");
const sidebar = document.getElementById("sidebar");

if (menuButton && sidebar) {
    menuButton.addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });
}