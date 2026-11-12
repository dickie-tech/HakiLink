
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
    setDoc,
    serverTimestamp,
    getDocs,
    query,
    where,
    onSnapshot,
    updateDoc,
     orderBy,
    increment
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

let conversations = [];
let selectedConversationId = null;

let unsubscribeConversations = null;
let unsubscribeMessages = null;


// =====================================
// NOTIFICATION STATE
// =====================================

let unsubscribeNotifications = null;

const notificationButton =
    document.getElementById("notificationButton");

const notificationDropdown =
    document.getElementById("notificationDropdown");

const notificationCount =
    document.getElementById("notificationCount");

const notificationList =
    document.getElementById("notificationList");

const notificationSubtitle =
    document.getElementById("notificationSubtitle");

const markAllReadButton =
    document.getElementById("markAllReadButton");


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


// =====================================
// CLIENT NOTIFICATION SYSTEM
// =====================================

// Escape text before inserting notification content into HTML.
function escapeNotificationText(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}


// Format Firestore timestamps.
function formatNotificationDate(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== "function") {
        return "Just now";
    }

    return timestamp.toDate().toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short"
    });
}


// Listen for notifications belonging to the logged-in client.
function listenForClientNotifications(user) {

    // Stop any previous listener.
    if (unsubscribeNotifications) {
        unsubscribeNotifications();
    }

    const notificationsQuery = query(
        collection(db, "notifications"),
        where("recipientId", "==", user.uid)
    );

    unsubscribeNotifications = onSnapshot(
        notificationsQuery,

        snapshot => {
            const notifications = snapshot.docs.map(document => ({
                id: document.id,
                ...document.data()
            }));

            // Newest notifications first.
            notifications.sort((a, b) => {
                const dateA = a.createdAt?.toMillis?.() || 0;
                const dateB = b.createdAt?.toMillis?.() || 0;

                return dateB - dateA;
            });

            renderClientNotifications(notifications);
        },

        error => {
            console.error(
                "Error listening for client notifications:",
                error
            );

            if (notificationList) {
                notificationList.innerHTML = `
                    <div class="notification-empty">
                        <p>Unable to load notifications.</p>
                    </div>
                `;
            }
        }
    );
}


// Display notifications and update the unread badge.
function renderClientNotifications(notifications) {

    if (!notificationList) return;

    const unreadNotifications = notifications.filter(
        notification => notification.isRead === false
    );

    // Update notification count.
    if (notificationCount) {
        const unreadCount = unreadNotifications.length;

        notificationCount.textContent =
            unreadCount > 99 ? "99+" : unreadCount;

        notificationCount.hidden = unreadCount === 0;
    }

    // Update subtitle.
    if (notificationSubtitle) {
        notificationSubtitle.textContent =
            unreadNotifications.length > 0
                ? `${unreadNotifications.length} unread notification(s)`
                : "You're all caught up.";
    }

    // Empty state.
    if (notifications.length === 0) {
        notificationList.innerHTML = `
            <div class="notification-empty">
                <p>No notifications yet.</p>
            </div>
        `;
        return;
    }

    // Render notification items.
    notificationList.innerHTML = notifications.map(notification => {

        const title = escapeNotificationText(notification.title);
        const message = escapeNotificationText(notification.message);
        const date = formatNotificationDate(notification.createdAt);

        const unreadClass = notification.isRead
            ? ""
            : "unread";

        return `
            <div
                class="notification-item ${unreadClass}"
                data-notification-id="${escapeNotificationText(notification.id)}"
            >
                <div class="notification-icon">⚖</div>

                <div>
                    <h4>${title}</h4>
                    <p>${message}</p>
                    <small>${escapeNotificationText(date)}</small>
                </div>
            </div>
        `;

    }).join("");
}


// Mark one notification as read.
async function markNotificationAsRead(notificationId) {

    try {
        await updateDoc(
            doc(db, "notifications", notificationId),
            {
                isRead: true
            }
        );

    } catch (error) {
        console.error("Could not mark notification as read:", error);
    }
}


// Mark all client notifications as read.
async function markAllClientNotificationsAsRead() {

    if (!currentClient) return;

    try {
        const notificationsQuery = query(
            collection(db, "notifications"),
            where("recipientId", "==", currentClient.uid)
        );

        const snapshot = await getDocs(notificationsQuery);

        const unreadNotifications = snapshot.docs.filter(
            notification => notification.data().isRead === false
        );

        await Promise.all(
            unreadNotifications.map(notification =>
                updateDoc(notification.ref, {
                    isRead: true
                })
            )
        );

    } catch (error) {
        console.error("Could not mark all notifications as read:", error);
    }
}


// Toggle notification dropdown.
if (notificationButton && notificationDropdown) {

    notificationButton.addEventListener("click", () => {

        const isOpening = notificationDropdown.hidden;

        notificationDropdown.hidden = !isOpening;

        notificationButton.setAttribute(
            "aria-expanded",
            String(isOpening)
        );
    });
}


// Mark a notification as read when clicked.
if (notificationList) {

    notificationList.addEventListener("click", event => {

        const notificationItem = event.target.closest(
            ".notification-item"
        );

        if (!notificationItem) return;

        const notificationId =
            notificationItem.dataset.notificationId;

        if (notificationId) {
            markNotificationAsRead(notificationId);
        }
    });
}


// Mark all notifications as read.
if (markAllReadButton) {
    markAllReadButton.addEventListener(
        "click",
        markAllClientNotificationsAsRead
    );
}


// Close dropdown when clicking outside.
document.addEventListener("click", event => {

    if (
        notificationDropdown &&
        notificationButton &&
        !event.target.closest(".notification-wrapper")
    ) {
        notificationDropdown.hidden = true;

        notificationButton.setAttribute(
            "aria-expanded",
            "false"
        );
    }
});


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

        const messageButton = createElement(
            "button",
            "message-lawyer-btn",
            "Message Lawyer"
        );

        messageButton.type = "button";

        messageButton.addEventListener("click", () => {
            startConversationWithLawyer(lawyer);
        });


        requestButton.type = "button";

        requestButton.addEventListener("click", () => {
            openConsultationModal(lawyer);
        });

        card.append(
            avatar,
            name,
            specialty,
            description,
            requestButton,
            messageButton
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

                const requestRef = await addDoc(
                        collection(db, "consultationRequests"),
                        {
                            lawyerId: selectedLawyer.uid,
                            clientId: currentClient.uid,
                            clientName: currentClientName,
                            subject: subject,
                            description: description,
                            status: "pending",
                            requestedAt: serverTimestamp()
                        }
                    );

                    // Notify the assigned lawyer.
                    try {

                        await setDoc(
                            doc(
                                db,
                                "notifications",
                                `${requestRef.id}_consultation_request`
                            ),
                            {
                                recipientId: selectedLawyer.uid,
                                senderId: currentClient.uid,
                                title: "New consultation request",
                                message: `${currentClientName} has sent you a consultation request.`,
                                type: "consultation_request",
                                relatedId: requestRef.id,
                                isRead: false,
                                createdAt: serverTimestamp()
                            }
                        );

                    } catch (notificationError) {

                        console.error(
                            "Consultation was submitted, but notification failed:",
                            notificationError
                        );

                    }

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

/* ============================================
   CLIENT MESSAGING SYSTEM
============================================ */

// Prevent HTML from being interpreted as markup
function escapeMessageHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}


// Format message/conversation time
function formatMessageTime(timestamp) {
    if (!timestamp || !timestamp.toDate) return "";

    return timestamp.toDate().toLocaleString([], {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short"
    });
}


// Listen for conversations belonging to the logged-in client
function listenForClientConversations() {
    if (!currentClient) return;

    if (unsubscribeConversations) {
        unsubscribeConversations();
    }

    const conversationsQuery = query(
        collection(db, "conversations"),
        where("clientId", "==", currentClient.uid)
    );

    unsubscribeConversations = onSnapshot(
        conversationsQuery,
        snapshot => {
            conversations = snapshot.docs.map(document => ({
                id: document.id,
                ...document.data()
            }));

            conversations.sort((a, b) => {
                const timeA = a.updatedAt?.toMillis?.() || 0;
                const timeB = b.updatedAt?.toMillis?.() || 0;

                return timeB - timeA;
            });

            function getClientUnreadCount() {
                return conversations.reduce((total, conversation) => {
                    return total + (Number(conversation.clientUnreadCount) || 0);
                }, 0);
            }
            renderClientConversations();

            const count = document.getElementById("messagesCount");
            const navCount = document.getElementById("messagesNavCount");
            const conversationCount = document.getElementById("conversationCount");

           if (count) {
                count.textContent = conversations.length;
            }

            // Show unread messages, not total conversations.
            if (navCount) {
                navCount.textContent = getClientUnreadCount();
            }

            if (conversationCount) {
                conversationCount.textContent = conversations.length;
            }

            // Refresh the selected conversation header when its details change
            if (selectedConversationId) {
                const selected = conversations.find(
                    conversation => conversation.id === selectedConversationId
                );

                if (selected) {
                    updateClientChatHeader(selected);
                }
            }
        },
        error => {
            console.error("Error loading conversations:", error);
        }
    );
}


// Display conversations in the sidebar
function renderClientConversations() {
    const list = document.getElementById("conversationsList");

    if (!list) return;

    const searchInput = document.getElementById("conversationSearch");
    const searchTerm = searchInput?.value.toLowerCase().trim() || "";

    const filtered = conversations.filter(conversation =>
        (conversation.lawyerName || "Lawyer")
            .toLowerCase()
            .includes(searchTerm)
    );

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="messages-empty">
                <span>💬</span>
                <h4>No conversations found</h4>
                <p>Your conversations with lawyers will appear here.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = filtered.map(conversation => {
        const lawyerName = escapeMessageHTML(
            conversation.lawyerName || "Lawyer"
        );

        const lastMessage = escapeMessageHTML(
            conversation.lastMessage || "Start a conversation"
        );

        const active = conversation.id === selectedConversationId
            ? "active"
            : "";
            const unread = Number(conversation.clientUnreadCount) || 0;

            const unreadBadge = unread > 0
                ? `<span class="conversation-unread-count">
                    ${unread > 99 ? "99+" : unread}
                </span>`
                : "";

            const unreadClass = unread > 0 ? "has-unread" : "";

        return `
            <div class="conversation-item ${active} ${unreadClass}"
                 data-conversation-id="${escapeMessageHTML(conversation.id)}">

                <div class="conversation-avatar">
                    ${lawyerName.charAt(0).toUpperCase()}
                </div>

                <div class="conversation-details">
                    <h4>${lawyerName}</h4>
                    <p>${lastMessage}</p>
                </div>
                ${unreadBadge}
            </div>
        `;
    }).join("");
}


// Update the chat header
function updateClientChatHeader(conversation) {
    const header = document.getElementById("chatHeader");

    if (!header) return;

    const lawyerName = escapeMessageHTML(
        conversation.lawyerName || "Lawyer"
    );

    header.innerHTML = `
        <div class="chat-placeholder">
            <span>⚖️</span>
            <div>
                <h3>${lawyerName}</h3>
                <p>Secure conversation with your legal professional</p>
            </div>
        </div>
    `;
}


// Open a selected conversation
async function selectClientConversation(conversation) {
    selectedConversationId = conversation.id;

    // Reset the client's unread message count.
    conversation.clientUnreadCount = 0;

    renderClientConversations();

    try {
        await updateDoc(
            doc(db, "conversations", conversation.id),
            {
                clientUnreadCount: 0
            }
        );
    } catch (error) {
        console.error(
            "Could not reset client unread count:",
            error
        );
    }

    renderClientConversations();
    updateClientChatHeader(conversation);

    const input = document.getElementById("messageInput");
    const button = document.getElementById("sendMessageButton");

    if (input) {
        input.disabled = false;
        input.placeholder = "Type your message...";
    }

    if (button) button.disabled = false;

    // Stop listening to the previously selected conversation
    if (unsubscribeMessages) {
        unsubscribeMessages();
    }

    const messagesQuery = query(
        collection(db, "conversations", conversation.id, "messages"),
        orderBy("createdAt", "asc")
    );

    unsubscribeMessages = onSnapshot(
        messagesQuery,
        snapshot => {
            renderClientMessages(snapshot.docs);
        },
        error => {
            console.error("Error loading messages:", error);
        }
    );
}


// Display messages
function renderClientMessages(messageDocs) {
    const messagesList = document.getElementById("messagesList");

    if (!messagesList) return;

    if (messageDocs.length === 0) {
        messagesList.innerHTML = `
            <div class="messages-empty">
                <span>✉️</span>
                <h4>No messages yet</h4>
                <p>Send a message to start the conversation.</p>
            </div>
        `;
        return;
    }

    messagesList.innerHTML = messageDocs.map(document => {
        const message = document.data();

        const mine = message.senderId === currentClient.uid;
        const messageClass = mine ? "mine" : "";

        return `
            <div class="message-bubble ${messageClass}">
                <p>${escapeMessageHTML(message.text || "")}</p>
                <small>${formatMessageTime(message.createdAt)}</small>
            </div>
        `;
    }).join("");

    messagesList.scrollTop = messagesList.scrollHeight;
}


// Start a conversation with a lawyer
async function startConversationWithLawyer(lawyer) {
    if (!currentClient || !lawyer) return;

    const lawyerId = lawyer.uid || lawyer.id;

    if (!lawyerId) {
        alert("Unable to identify this lawyer's account.");
        return;
    }

    try {
        let conversation = conversations.find(item =>
            item.lawyerId === lawyerId
        );

        // Check Firestore as well in case the list has not loaded yet
        if (!conversation) {
            const existingQuery = query(
                collection(db, "conversations"),
                where("clientId", "==", currentClient.uid),
                where("lawyerId", "==", lawyerId)
            );

            const existingSnapshot = await getDocs(existingQuery);

            if (!existingSnapshot.empty) {
                const existingDoc = existingSnapshot.docs[0];

                conversation = {
                    id: existingDoc.id,
                    ...existingDoc.data()
                };
            }
        }

        // Create a conversation if one does not already exist
        if (!conversation) {
            const lawyerName =
                lawyer.fullName ||
                lawyer.name ||
                lawyer.firmName ||
                lawyer.lawFirmName ||
                "Lawyer";

            const conversationRef = await addDoc(
                collection(db, "conversations"),
                {
                    lawyerId: lawyerId,
                    clientId: currentClient.uid,
                    clientName: currentClientName || "Client",
                    lawyerName: lawyerName,
                    lastMessage: "",
                    updatedAt: serverTimestamp()
                }
            );

            conversation = {
                id: conversationRef.id,
                lawyerId: lawyerId,
                clientId: currentClient.uid,
                clientName: currentClientName || "Client",
                lawyerName: lawyerName
            };
        }

        // Open the Messages section
        const messagesSection = document.getElementById("messages");

        if (messagesSection) {
            messagesSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }

        selectClientConversation(conversation);

    } catch (error) {
        console.error("Error starting conversation:", error);
        alert("Unable to start conversation. Please try again.");
    }
}


// Send a message
async function sendClientMessage(event) {
    event.preventDefault();

    if (!currentClient || !selectedConversationId) return;

    const input = document.getElementById("messageInput");
    const button = document.getElementById("sendMessageButton");

    const text = input.value.trim();

    if (!text) return;

    button.disabled = true;

    try {
        const conversationRef = doc(
            db,
            "conversations",
            selectedConversationId
        );

        // Save the message in the conversation's messages subcollection
        await addDoc(
            collection(
                db,
                "conversations",
                selectedConversationId,
                "messages"
            ),
            {
                senderId: currentClient.uid,
                text: text,
                createdAt: serverTimestamp()
            }
        );

        // Update the conversation preview and activity time
        await updateDoc(conversationRef, {
            lastMessage: text,
            updatedAt: serverTimestamp(),
            lawyerUnreadCount: increment(1)
        });

        input.value = "";

    } catch (error) {
        console.error("Error sending message:", error);
        alert("Message could not be sent. Please try again.");
    } finally {
        button.disabled = false;
        input.focus();
    }
}


// Connect messaging interface events

function initializeClientMessaging() {
    const conversationsList =
        document.getElementById("conversationsList");

    const messageForm =
        document.getElementById("messageForm");

    const conversationSearch =
        document.getElementById("conversationSearch");

    // Handle conversation selection
    conversationsList?.addEventListener("click", event => {

        const clickedElement = event.target.closest(
            ".conversation-item"
        );

        if (!clickedElement) return;

        const conversationId =
            clickedElement.dataset.conversationId;

        const selectedConversation = conversations.find(
            conversation => conversation.id === conversationId
        );

        if (selectedConversation) {
            selectClientConversation(selectedConversation);
        }
    });

    // Handle message submission
    messageForm?.addEventListener(
        "submit",
        sendClientMessage
    );

    // Search conversations
    conversationSearch?.addEventListener(
        "input",
        renderClientConversations
    );

    // Start listening for conversations
    listenForClientConversations();
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
    listenForClientNotifications(user);

    if (!currentClient) {
        return;
    }
    // Start the client messaging system
    initializeClientMessaging();
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


// ============================================
// MOBILE HAMBURGER MENU
// ============================================

const menuButton = document.getElementById("menuButton");
const sidebar = document.getElementById("sidebar");

function closeSidebar() {
    if (!sidebar || !menuButton) return;

    sidebar.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
}

function toggleSidebar() {
    if (!sidebar || !menuButton) return;

    const isOpen = sidebar.classList.toggle("open");

    menuButton.setAttribute(
        "aria-expanded",
        String(isOpen)
    );
}

if (menuButton && sidebar) {

    // Open and close using the hamburger button
    menuButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleSidebar();
    });

    // Close when clicking outside the sidebar
    document.addEventListener("click", (event) => {
        if (
            sidebar.classList.contains("open") &&
            !sidebar.contains(event.target) &&
            !menuButton.contains(event.target)
        ) {
            closeSidebar();
        }
    });

    // Close when a navigation link is selected
    sidebar.querySelectorAll(".sidebar-nav a").forEach((link) => {
        link.addEventListener("click", () => {
            closeSidebar();
        });
    });

    // Close when Escape is pressed
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeSidebar();
        }
    });

}
