
/* ============================================
   HAKILINK LAWYER DASHBOARD
============================================ */

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc,
    updateDoc,
    setDoc,
    collection,
    getDocs,
    query,
    where,
    orderBy,
    addDoc,
    serverTimestamp,
    Timestamp,
    onSnapshot,
    increment
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


// ============================================
// PRIVATE DOCUMENT STORAGE
// ============================================

const SUPABASE_URL = "https://uwzuzdvidkllbsolmhdv.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_2Or4n0jwCAlrNpSVSDAi2Q_4rn2fe5Y";

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DOCUMENTS = 10;
const STORAGE_BUCKET = "lawyer-qualification-documents";


// ============================================
// STATE
// ============================================

let currentUser = null;
let currentProfile = null;
let requests = [];
let appointments = [];
let conversations = [];
let selectedConversationId = null;
let conversationLoadToken = 0;
let unsubscribeConversations = null;


// ============================================
// ELEMENTS
// ============================================

const $ = (id) => document.getElementById(id);

const pageMessage = $("pageMessage");
const logoutButton = $("logoutButton");
const menuButton = $("menuButton");
const sidebar = $("sidebar");

const profileForm = $("profileForm");
const messageForm = $("messageForm");
// ============================================
// FLEXIBLE MESSAGE INPUT
// ============================================

const messageInput = $("messageInput");

function resizeMessageInput() {
    if (!messageInput) return;

    messageInput.style.height = "auto";

    messageInput.style.height =
        `${Math.min(messageInput.scrollHeight, 140)}px`;
}

messageInput?.addEventListener("input", resizeMessageInput);

messageInput?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();

        messageForm?.requestSubmit();
    }
});

// ============================================
// LAWYER NOTIFICATIONS
// ============================================

let unsubscribeNotifications = null;
let lawyerNotifications = [];

const notificationButton = $("notificationButton");
const notificationDropdown = $("notificationDropdown");
const notificationCount = $("notificationCount");
const notificationList = $("notificationList");
const notificationSubtitle = $("notificationSubtitle");
const markAllReadButton = $("markAllReadButton");


// ============================================
// MESSAGES
// ============================================

function showMessage(message, type = "info") {
    if (!pageMessage) return;

    pageMessage.textContent = message;
    pageMessage.className = `page-message ${type}`;
    pageMessage.hidden = false;

    pageMessage.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}

function clearMessage() {
    if (!pageMessage) return;

    pageMessage.textContent = "";
    pageMessage.hidden = true;
    pageMessage.className = "page-message";
}

// ============================================
// SECURE APPLICATION API HELPERS
// ============================================

async function applicationApi(endpoint, body) {
    if (!currentUser) {
        throw new Error("Please log in again.");
    }

    const token = await currentUser.getIdToken();

    const response = await fetch(`/api/${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            result.error || result.message || "The request could not be completed."
        );
    }

    return result;
}


function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


function validateApplicationFile(file, documentType) {
    const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ];

    if (!file) {
        throw new Error("Please select a document.");
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`${file.name} exceeds the 5 MB limit.`);
    }

    if (!allowedTypes.includes(file.type)) {
        throw new Error("Only PDF, JPG and PNG documents are accepted.");
    }

    if (documentType === "cv" && file.type !== "application/pdf") {
        throw new Error("Your CV must be uploaded as a PDF.");
    }
}


function getApplicationId(result) {
    const id = result.applicationId || result.draftId;

    if (!id) {
        throw new Error("The server did not return an application draft ID.");
    }

    return id;
}
// ============================================
// SAFE DOM HELPERS
// ============================================

function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
}

function getInitials(name) {
    if (!name) return "HL";

    const words = name.trim().split(/\s+/);

    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    return (
        words[0][0] + words[words.length - 1][0]
    ).toUpperCase();
}

function formatDate(value) {
    if (!value) return "Date not provided";

    let date;

    if (value instanceof Date) {
        date = value;
    } else if (typeof value.toDate === "function") {
        date = value.toDate();
    } else if (
        typeof value === "string" ||
        typeof value === "number"
    ) {
        date = new Date(value);
    } else if (typeof value.seconds === "number") {
        date = new Date(value.seconds * 1000);
    } else {
        return "Date not provided";
    }

    if (Number.isNaN(date.getTime())) {
        return "Date not provided";
    }

    return date.toLocaleString("en-KE", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

function normaliseStatus(value) {
    return String(value || "pending").toLowerCase();
}

function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value ?? "";
}

function setAvatar(id, name) {
    setText(id, getInitials(name));
}

function makeStatus(status) {
    const value = normaliseStatus(status);
    return element("span", `status-pill ${value}`, value);
}

function showEmpty(container, message) {
    if (!container) return;

    container.replaceChildren(
        element("p", "empty-state", message)
    );
}



// ============================================
// LAWYER NOTIFICATION FUNCTIONS
// ============================================

function escapeNotificationText(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}


// Format notification timestamp
function formatNotificationDate(timestamp) {
    if (!timestamp) return "Just now";

    const date = timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "Just now";

    return date.toLocaleString("en-KE", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}


// Listen for notifications belonging to the logged-in lawyer
function listenForLawyerNotifications(user) {

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
            lawyerNotifications = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            }));

            lawyerNotifications.sort((a, b) => {
                return toMillis(b.createdAt) - toMillis(a.createdAt);
            });

            renderLawyerNotifications();
        },

        error => {
            console.error(
                "Lawyer notification listener failed:",
                error
            );
        }
    );
}


// Display notifications and unread count
function renderLawyerNotifications() {

    if (!notificationList || !notificationCount) return;

    const unreadCount = lawyerNotifications.filter(
        item => item.isRead === false
    ).length;

    notificationCount.textContent =
        unreadCount > 99 ? "99+" : unreadCount;

    notificationCount.hidden = unreadCount === 0;

    if (notificationSubtitle) {
        notificationSubtitle.textContent =
            unreadCount === 0
                ? "You're all caught up."
                : `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`;
    }

    if (lawyerNotifications.length === 0) {
        notificationList.innerHTML = `
            <div class="notification-empty">
                <p>No notifications yet.</p>
            </div>
        `;
        return;
    }

    notificationList.innerHTML = lawyerNotifications.map(item => `
        <div
            class="notification-item ${item.isRead ? "" : "unread"}"
            data-notification-id="${escapeNotificationText(item.id)}"
            role="button"
            tabindex="0"
        >
            <div class="notification-item-content">
                <h4>${escapeNotificationText(item.title || "Notification")}</h4>

                <p>${escapeNotificationText(item.message || "")}</p>

                <small>
                    ${escapeNotificationText(formatNotificationDate(item.createdAt))}
                </small>
            </div>
        </div>
    `).join("");
}


// Mark an individual notification as read
async function markLawyerNotificationAsRead(notificationId) {

    const notification = lawyerNotifications.find(
        item => item.id === notificationId
    );

    if (!notification || notification.isRead) return;

    try {
        await updateDoc(
            doc(db, "notifications", notificationId),
            { isRead: true }
        );

    } catch (error) {
        console.error("Could not mark notification as read:", error);
    }
}


// Mark all notifications as read
async function markAllLawyerNotificationsAsRead() {

    const unread = lawyerNotifications.filter(
        item => item.isRead === false
    );

    if (!unread.length) return;

    if (markAllReadButton) {
        markAllReadButton.disabled = true;
    }

    try {
        await Promise.all(
            unread.map(item =>
                updateDoc(
                    doc(db, "notifications", item.id),
                    { isRead: true }
                )
            )
        );

    } catch (error) {
        console.error("Could not mark all notifications as read:", error);

    } finally {
        if (markAllReadButton) {
            markAllReadButton.disabled = false;
        }
    }
}


// Toggle notification dropdown
notificationButton?.addEventListener("click", () => {

    if (!notificationDropdown) return;

    const isOpening = notificationDropdown.hidden;

    notificationDropdown.hidden = !isOpening;

    notificationButton.setAttribute(
        "aria-expanded",
        String(isOpening)
    );
});


// Handle individual notification clicks
notificationList?.addEventListener("click", event => {

    const item = event.target.closest("[data-notification-id]");

    if (!item) return;

    markLawyerNotificationAsRead(
        item.dataset.notificationId
    );
});


// Keyboard support
notificationList?.addEventListener("keydown", event => {

    if (event.key !== "Enter" && event.key !== " ") return;

    const item = event.target.closest("[data-notification-id]");

    if (!item) return;

    event.preventDefault();

    markLawyerNotificationAsRead(
        item.dataset.notificationId
    );
});


// Mark all as read
markAllReadButton?.addEventListener(
    "click",
    markAllLawyerNotificationsAsRead
);


// Close dropdown when clicking outside
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
// NAVIGATION
// ============================================

const sectionTitles = {
    overview: "Overview",
    requests: "Client Requests",
    appointments: "Appointments",
    messages: "Messages",
    profile: "Professional Profile",
    "find-firms": "Find Law Firms",
    "my-applications": "My Applications"
};

function openSection(sectionId) {
    const target = $(sectionId);

    if (!target || !sectionTitles[sectionId]) return;

    document.querySelectorAll(".dashboard-section")
        .forEach((section) => section.classList.remove("active"));

    target.classList.add("active");

    document.querySelectorAll("[data-section]")
        .forEach((button) => {
            button.classList.toggle(
                "active",
                button.dataset.section === sectionId
            );
        });

    setText("pageTitle", sectionTitles[sectionId]);

    sidebar?.classList.remove("open");
    clearMessage();
}

document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
        openSection(button.dataset.section);
    });
});

menuButton?.addEventListener("click", () => {
    sidebar?.classList.toggle("open");
});


// ============================================
// LOAD LAWYER PROFILE
// ============================================

async function loadProfile(user) {
    const profileRef = doc(db, "users", user.uid);
    const profileSnapshot = await getDoc(profileRef);

    if (!profileSnapshot.exists()) {
        throw new Error(
            "Your HakiLink user profile was not found in Firestore."
        );
    }

    const profile = profileSnapshot.data();

    if (profile.role !== "lawyer") {
        window.location.replace("../auth/login.html");
        throw new Error(
            "This dashboard is available to lawyer accounts only."
        );
    }

    currentProfile = profile;

    const fullName = profile.fullName || user.displayName || "Lawyer";

    setText("welcomeName", fullName);
    setText("topbarUserName", fullName);
    setText("profileName", fullName);
    setText("profilePracticeArea", profile.practiceArea || "Practice area not set");
    setText("profileEmail", profile.email || user.email || "");

    setAvatar("userAvatar", fullName);
    setAvatar("profileAvatar", fullName);

    $("profileFullName").value = profile.fullName || "";
    $("profilePhone").value = profile.phone || "";
    $("profilePracticeArea").value = profile.practiceArea || "";
    $("profileBarNumber").value = profile.barAdmissionNumber || "";

    // Preserve the authenticated account email as the source of truth.
    $("profileEmail").value = user.email || profile.email || "";
}


// ============================================
// SAVE PROFILE
// ============================================

profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !currentProfile) return;

    const fullName = $("profileFullName").value.trim();
    const phone = $("profilePhone").value.trim();
    const practiceArea = $("profilePracticeArea").value;
    const barAdmissionNumber = $("profileBarNumber").value.trim();

    if (!fullName || !phone || !practiceArea || !barAdmissionNumber) {
        showMessage("Please complete all required profile fields.", "error");
        return;
    }

    const saveButton = $("saveProfileButton");
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
        await updateDoc(
            doc(db, "users", currentUser.uid),
            {
                fullName,
                phone,
                practiceArea,
                barAdmissionNumber
            }
        );

        // Keep the directory's public fields synchronised.
        // Email, phone and bar number remain in the private users document.
        await setDoc(
            doc(db, "publicLawyers", currentUser.uid),
            {
                uid: currentUser.uid,
                fullName,
                practiceArea,
                createdAt: serverTimestamp()
            },
            { merge: true }
        );

        currentProfile = {
            ...currentProfile,
            fullName,
            phone,
            practiceArea,
            barAdmissionNumber
        };

        setText("welcomeName", fullName);
        setText("topbarUserName", fullName);
        setText("profileName", fullName);
        setText("profilePracticeArea", practiceArea);

        setAvatar("userAvatar", fullName);
        setAvatar("profileAvatar", fullName);

        showMessage("Your professional profile has been updated.", "success");

    } catch (error) {
        console.error("Profile update failed:", error);

        showMessage(
            "We couldn't save your profile. Check your Firestore rules and try again.",
            "error"
        );
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Changes";
    }
});


// ============================================
// LOAD CLIENT REQUESTS
//
// Expected collection: consultationRequests
// Expected fields:
// lawyerId, clientName, subject, description,
// status, requestedAt
// ============================================

async function loadRequests() {
    const container = $("requestsList");
    const recentContainer = $("recentRequests");

    showEmpty(container, "Loading requests...");
    showEmpty(recentContainer, "Loading requests...");

    try {
        const requestQuery = query(
            collection(db, "consultationRequests"),
            where("lawyerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(requestQuery);

        requests = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
        }));

        requests.sort((a, b) => {
            const dateA = a.requestedAt?.toMillis?.() || 0;
            const dateB = b.requestedAt?.toMillis?.() || 0;
            return dateB - dateA;
        });

        renderRequests();
        updateStatistics();

    } catch (error) {
        console.error("Could not load client requests:", error);

        showEmpty(
            container,
            "Requests could not be loaded. Check your Firestore rules and collection setup."
        );

        showEmpty(
            recentContainer,
            "Client requests are currently unavailable."
        );
    }
}


function createRequestItem(request, compact = false) {
    const item = element("article", "data-item");
    const main = element("div", "data-item-main");

    const title = request.subject || "Consultation request";
    main.appendChild(element("h4", "", title));

    main.appendChild(element(
        "p",
        "",
        `Client: ${request.clientName || "Client"}`
    ));

    if (request.description) {
        main.appendChild(element(
            "p",
            "",
            request.description
        ));
    }

    main.appendChild(element(
        "p",
        "item-date",
        `Requested: ${formatDate(request.requestedAt)}`
    ));

    const status = normaliseStatus(request.status);
    main.appendChild(makeStatus(status));

    if (!compact && status === "pending") {
        // Inline feedback field
        const feedbackGroup = element("div", "feedback-group");

        const feedbackLabel = element(
            "label",
            "feedback-label",
            "Feedback for client (optional)"
        );

        const feedbackInput = element("textarea", "feedback-input");
        feedbackInput.placeholder =
            "Write a message to explain your decision...";
        feedbackInput.rows = 3;
        feedbackInput.maxLength = 1000;

        feedbackLabel.htmlFor = `feedback-${request.id}`;
        feedbackInput.id = `feedback-${request.id}`;

        feedbackGroup.append(feedbackLabel, feedbackInput);
        main.appendChild(feedbackGroup);

        // Accept and Decline buttons
        const actions = element("div", "item-actions");

        const acceptButton = element(
            "button",
            "small-button accept",
            "Accept"
        );
        acceptButton.type = "button";

        acceptButton.addEventListener("click", () => {
            updateRequestStatus(
                request.id,
                "accepted",
                acceptButton,
                feedbackInput.value
            );
        });

        const declineButton = element(
            "button",
            "small-button decline",
            "Decline"
        );
        declineButton.type = "button";

        declineButton.addEventListener("click", () => {
            updateRequestStatus(
                request.id,
                "declined",
                declineButton,
                feedbackInput.value
            );
        });

        actions.append(acceptButton, declineButton);
        main.appendChild(actions);
    }
    
    // Allow lawyers to schedule appointments for accepted requests.
    if (!compact && normaliseStatus(request.status) === "accepted") {
        const existingAppointment = appointments.find(
            (appointment) => appointment.requestId === request.id
        );

        if (existingAppointment) {
            const scheduledInfo = element(
                "div",
                "saved-feedback"
            );

            scheduledInfo.appendChild(
                element("strong", "", "Appointment scheduled")
            );

            scheduledInfo.appendChild(
                element(
                    "p",
                    "",
                    formatDate(existingAppointment.dateTime)
                )
            );

            main.appendChild(scheduledInfo);

        } else {
            const scheduleGroup = element("div", "feedback-group");

            scheduleGroup.appendChild(
                element("h4", "", "Schedule Appointment")
            );

            const dateLabel = element(
                "label",
                "feedback-label",
                "Appointment date"
            );

            const dateInput = element("input", "feedback-input");
            dateInput.type = "date";
            dateInput.min = new Date().toLocaleDateString("en-CA");
            dateInput.required = true;

            dateLabel.htmlFor = `appointment-date-${request.id}`;
            dateInput.id = dateLabel.htmlFor;

            const timeLabel = element(
                "label",
                "feedback-label",
                "Appointment time"
            );

            const timeInput = element("input", "feedback-input");
            timeInput.type = "time";
            timeInput.required = true;

            timeLabel.htmlFor = `appointment-time-${request.id}`;
            timeInput.id = timeLabel.htmlFor;

            const scheduleButton = element(
                "button",
                "small-button accept",
                "Schedule Appointment"
            );

            scheduleButton.type = "button";

            scheduleButton.addEventListener("click", () => {
                scheduleAppointment(
                    request,
                    dateInput,
                    timeInput,
                    scheduleButton
                );
            });

            scheduleGroup.append(
                dateLabel,
                dateInput,
                timeLabel,
                timeInput,
                scheduleButton
            );

            main.appendChild(scheduleGroup);
        }
    }

    // Display previously saved feedback
    if (request.lawyerFeedback) {
        const savedFeedback = element("div", "saved-feedback");
        savedFeedback.appendChild(
            element("strong", "", "Your feedback")
        );
        savedFeedback.appendChild(
            element("p", "", request.lawyerFeedback)
        );
        main.appendChild(savedFeedback);
    }

    item.appendChild(main);
    return item;
}

function renderRequests() {
    const container = $("requestsList");
    const recentContainer = $("recentRequests");

    const searchTerm = ($("requestSearch")?.value || "")
        .trim().toLowerCase();

    const selectedStatus = $("requestStatusFilter")?.value || "";

    const filtered = requests.filter((request) => {
        const haystack = [
            request.clientName,
            request.subject,
            request.description
        ].join(" ").toLowerCase();

        const status = normaliseStatus(request.status);

        return haystack.includes(searchTerm) &&
            (!selectedStatus || status === selectedStatus);
    });

    if (filtered.length === 0) {
        showEmpty(
            container,
            requests.length
                ? "No requests match your filters."
                : "You don't have any client requests yet."
        );
    } else {
        container.replaceChildren(
            ...filtered.map((request) => createRequestItem(request))
        );
    }

    const recent = requests.slice(0, 3);

    if (recent.length === 0) {
        showEmpty(recentContainer, "No client requests yet.");
    } else {
        recentContainer.replaceChildren(
            ...recent.map((request) => createRequestItem(request, true))
        );
    }
}

$("requestSearch")?.addEventListener("input", renderRequests);
$("requestStatusFilter")?.addEventListener("change", renderRequests);




async function updateRequestStatus(
    requestId,
    status,
    button,
    feedbackText = ""
) {
    if (!currentUser) return;

    const lawyerFeedback = feedbackText.trim();

    if (lawyerFeedback.length > 1000) {
        showMessage(
            "Feedback must be 1,000 characters or fewer.",
            "error"
        );
        return;
    }

    // Find the consultation request.
    const request = requests.find(
        (item) => item.id === requestId
    );

    if (!request || !request.clientId) {
        showMessage(
            "Could not find the client's account information.",
            "error"
        );
        return;
    }

    button.disabled = true;

    const originalText = button.textContent;
    button.textContent = "Saving...";

    try {

        // 1. Update consultation request status.
        await updateDoc(
            doc(db, "consultationRequests", requestId),
            {
                status,
                lawyerFeedback,
                updatedAt: serverTimestamp()
            }
        );

        // 2. Update local request data.
        request.status = status;
        request.lawyerFeedback = lawyerFeedback;

        // 3. Create a notification for the client.
        const notificationType =
            status === "accepted"
                ? "consultation_accepted"
                : "consultation_declined";

        const notificationTitle =
            status === "accepted"
                ? "Consultation Request Accepted"
                : "Consultation Request Declined";

        const notificationMessage =
            status === "accepted"
                ? `${currentProfile.fullName || "Your lawyer"} has accepted your consultation request.`
                : `${currentProfile.fullName || "Your lawyer"} has declined your consultation request.`;

        console.log("Notification data:", {
                recipientId: request.clientId,
                senderId: currentUser.uid,
                type: notificationType,
                relatedId: requestId,
                status: request.status
            });

        try {

            await setDoc(
                doc(
                    db,
                    "notifications",
                    `${requestId}_${notificationType}`
                ),
                {
                    recipientId: request.clientId,
                    senderId: currentUser.uid,
                    title: notificationTitle,
                    message: notificationMessage,
                    type: notificationType,
                    relatedId: requestId,
                    isRead: false,
                    createdAt: serverTimestamp()
                }
            );

            console.log(
                "Client notification created successfully."
            );

        } catch (notificationError) {

            console.error(
                "Consultation updated, but notification creation failed:",
                notificationError
            );

            showMessage(
                `Request updated, but notification failed: ${notificationError.code || notificationError.message}`,
                "error"
            );

        }

        // 4. Refresh dashboard.
        renderRequests();
        updateStatistics();

        showMessage(
            `Request ${status} successfully.`,
            "success"
        );

    } catch (error) {

        console.error("Could not update request:", error);
        console.error("Firebase error code:", error.code);

        showMessage(
            `Could not update request: ${error.message}`,
            "error"
        );

    } finally {

        button.disabled = false;
        button.textContent = originalText;

    }
}


async function scheduleAppointment(request, dateInput, timeInput, button) {
    if (!currentUser) return;

    if (normaliseStatus(request.status) !== "accepted") {
        showMessage(
            "Only accepted consultation requests can be scheduled.",
            "error"
        );
        return;
    }

    if (!request.clientId) {
        showMessage(
            "This request has no client ID. Please check the request document in Firestore.",
            "error"
        );
        return;
    }

    const date = dateInput.value;
    const time = timeInput.value;

    if (!date || !time) {
        showMessage("Please select an appointment date and time.", "error");
        return;
    }

    const dateTime = new Date(`${date}T${time}`);

    if (Number.isNaN(dateTime.getTime()) || dateTime <= new Date()) {
        showMessage(
            "Choose a valid appointment date and time in the future.",
            "error"
        );
        return;
    }

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Scheduling...";

    try {
        // Prevent duplicate appointments for the same request.
        
        const existingQuery = query(
            collection(db, "appointments"),
            where("lawyerId", "==", currentUser.uid)
        );

        const existingSnapshot = await getDocs(existingQuery);

        const alreadyScheduled = existingSnapshot.docs.some(
            (item) => item.data().requestId === request.id
        );

        if (alreadyScheduled) {
            showMessage(
                "An appointment already exists for this request.",
                "error"
            );
            return;
        }

        await addDoc(collection(db, "appointments"), {
            requestId: request.id,
            clientId: request.clientId,
            lawyerId: currentUser.uid,
            clientName: request.clientName || "HakiLink Client",
            title: request.subject || "Client consultation",
            dateTime: Timestamp.fromDate(dateTime),
            status: "scheduled",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        await loadAppointments();

        showMessage(
            "Appointment scheduled successfully!",
            "success"
        );

    } catch (error) {
    console.error("Appointment scheduling failed:", error);
    console.error("Firebase error code:", error.code);
    console.error("Firebase error message:", error.message);

    showMessage(
        `Scheduling failed: ${error.code || "unknown-error"} — ${error.message || "Unknown error"}`,
        "error"
    );
} finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}



// ============================================
// LOAD APPOINTMENTS
//
// Expected collection: appointments
// Expected fields:
// lawyerId, clientName, title, dateTime, status
// ============================================

async function loadAppointments() {
    const container = $("appointmentsList");
    const recentContainer = $("recentAppointments");

    showEmpty(container, "Loading appointments...");
    showEmpty(recentContainer, "Loading appointments...");

    try {
        const appointmentQuery = query(
            collection(db, "appointments"),
            where("lawyerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(appointmentQuery);

        appointments = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
        }));

        appointments.sort((a, b) => {
            return toMillis(a.dateTime) - toMillis(b.dateTime);
        });

        renderAppointments();
        renderRequests();
        updateStatistics();

    } catch (error) {
        console.error("Could not load appointments:", error);

        showEmpty(
            container,
            "Appointments could not be loaded. Check your Firestore rules and collection setup."
        );

        showEmpty(
            recentContainer,
            "Appointments are currently unavailable."
        );
    }
}

function toMillis(value) {
    if (value?.toMillis) return value.toMillis();
    if (value?.seconds) return value.seconds * 1000;

    const result = new Date(value || 0).getTime();
    return Number.isNaN(result) ? 0 : result;
}

function createAppointmentItem(appointment) {
    const item = element("article", "data-item");
    const main = element("div", "data-item-main");

    main.appendChild(element(
        "h4",
        "",
        appointment.title || "Client consultation"
    ));

    main.appendChild(element(
        "p",
        "",
        `Client: ${appointment.clientName || "Client"}`
    ));

    main.appendChild(element(
        "p",
        "item-date",
        formatDate(appointment.dateTime)
    ));

    main.appendChild(makeStatus(appointment.status));

    item.appendChild(main);
    return item;
}

function renderAppointments() {
    const container = $("appointmentsList");
    const recentContainer = $("recentAppointments");

    const searchTerm = ($("appointmentSearch")?.value || "")
        .trim().toLowerCase();

    const selectedStatus = $("appointmentStatusFilter")?.value || "";

    const filtered = appointments.filter((appointment) => {
        const haystack = [
            appointment.clientName,
            appointment.title
        ].join(" ").toLowerCase();

        const status = normaliseStatus(appointment.status);

        return haystack.includes(searchTerm) &&
            (!selectedStatus || status === selectedStatus);
    });

    if (filtered.length === 0) {
        showEmpty(
            container,
            appointments.length
                ? "No appointments match your filters."
                : "You don't have any appointments yet."
        );
    } else {
        container.replaceChildren(
            ...filtered.map(createAppointmentItem)
        );
    }

    const now = Date.now();

    const upcoming = appointments
        .filter((appointment) => {
            return toMillis(appointment.dateTime) >= now &&
                !["cancelled", "completed"].includes(
                    normaliseStatus(appointment.status)
                );
        })
        .slice(0, 3);

    if (upcoming.length === 0) {
        showEmpty(recentContainer, "No upcoming consultations.");
    } else {
        recentContainer.replaceChildren(
            ...upcoming.map(createAppointmentItem)
        );
    }
}


// ============================================
// LAW FIRM DIRECTORY AND APPLICATIONS
// ============================================

let publicFirms = [];
let firmApplications = [];

// Load public law firm profiles
async function loadPublicFirms() {
    const container = $("firmsList");

    showEmpty(container, "Loading law firms...");

    try {
        const snapshot = await getDocs(
            collection(db, "publicFirms")
        );

        publicFirms = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        publicFirms.sort((a, b) =>
            String(a.firmName || "").localeCompare(
                String(b.firmName || "")
            )
        );

        renderPublicFirms();

    } catch (error) {
        console.error("Could not load law firms:", error);

        showEmpty(
            container,
            "Law firms could not be loaded. Check your Firestore rules."
        );
    }
}


// Render the available law firms
function renderPublicFirms() {
    const container = $("firmsList");

    if (!container) return;

    const searchTerm = (
        $("firmSearch")?.value || ""
    ).trim().toLowerCase();

    const filtered = publicFirms.filter(firm => {
        const areas = Array.isArray(firm.practiceAreas)
            ? firm.practiceAreas.join(" ")
            : "";

        const searchable = [
            firm.firmName,
            firm.location,
            firm.description,
            areas
        ].join(" ").toLowerCase();

        return searchable.includes(searchTerm);
    });

    if (!filtered.length) {
        showEmpty(
            container,
            publicFirms.length
                ? "No law firms match your search."
                : "No law firms have published their profiles yet."
        );
        return;
    }

    const cards = filtered.map(firm => {
        const card = element("article", "data-item");
        const main = element("div", "data-item-main");

        main.appendChild(
            element("h3", "", firm.firmName || "Law Firm")
        );

        main.appendChild(
            element(
                "p",
                "",
                firm.location || "Location not provided"
            )
        );

        main.appendChild(
            element(
                "p",
                "",
                firm.description || "No firm description available."
            )
        );

        const areas = Array.isArray(firm.practiceAreas)
            ? firm.practiceAreas
            : [];

        main.appendChild(
            element(
                "p",
                "",
                areas.length
                    ? `Practice areas: ${areas.join(", ")}`
                    : "Practice areas not provided"
            )
        );

        const applyButton = element(
            "button",
            "small-button accept",
            "Apply to Join"
        );

        applyButton.type = "button";

        applyButton.addEventListener("click", () => {
            showFirmApplicationForm(firm, card);
        });

        main.appendChild(applyButton);
        card.appendChild(main);

        return card;
    });

    container.replaceChildren(...cards);
    if (firmApplications.length) {
    renderMyApplications();
    }
}


// Display the application form for a selected firm
// ============================================
// DISPLAY LAW FIRM APPLICATION FORM
// ============================================

async function showFirmApplicationForm(firm, card) {

    const existingForm = card.querySelector(".firm-application-form");

    if (existingForm) {
        existingForm.remove();
        return;
    }

    if (!currentUser || !currentProfile) return;

    try {
        showMessage("Preparing your application...", "info");

        // Create a private draft through the backend.
        const draftResult = await applicationApi(
            "create-application-draft",
            {
                firmId: firm.id
            }
        );

        const applicationId = getApplicationId(draftResult);

        const form = element("form", "firm-application-form");

        const uploadedDocuments = [];

        form.dataset.applicationId = applicationId;

        form.appendChild(
            element("h4", "", `Apply to ${firm.firmName}`)
        );

        form.appendChild(
            element(
                "p",
                "",
                "Complete your application and upload the required qualification documents."
            )
        );

        // ------------------------------------
        // TEXT FIELDS
        // ------------------------------------

        const fields = [
            {
                label: "Qualifications",
                name: "qualifications",
                placeholder: "e.g. LLB, University of Nairobi",
                type: "input",
                maxLength: 2000
            },
            {
                label: "Professional experience",
                name: "experience",
                placeholder: "Describe your relevant legal experience",
                type: "textarea",
                maxLength: 5000
            },
            {
                label: "Cover letter",
                name: "coverLetter",
                placeholder: "Explain why you would like to join this firm",
                type: "textarea",
                maxLength: 3000
            }
        ];

        fields.forEach(field => {
            const group = element("div", "feedback-group");

            const label = element(
                "label",
                "feedback-label",
                field.label
            );

            const input = element(
                field.type === "textarea" ? "textarea" : "input",
                "feedback-input"
            );

            input.name = field.name;
            input.required = true;
            input.maxLength = field.maxLength;
            input.placeholder = field.placeholder;

            if (field.type === "textarea") {
                input.rows = 4;
            }

            group.append(label, input);
            form.appendChild(group);
        });

        // ------------------------------------
        // DOCUMENT UPLOAD SECTION
        // ------------------------------------

        const documentSection = element("div", "feedback-group");

        documentSection.appendChild(
            element("h4", "", "Qualification Documents")
        );

        documentSection.appendChild(
            element(
                "p",
                "",
                "PDF, JPG or PNG files are accepted. Maximum 5 MB per file. Your CV must be PDF."
            )
        );

        const documentList = element("div", "uploaded-document-list");

        documentSection.appendChild(documentList);

        const documentTypes = [
            {
                type: "cv",
                label: "CV / Resume",
                required: true,
                multiple: false
            },
            {
                type: "academic_certificate",
                label: "Academic Certificate",
                required: true,
                multiple: false
            },
            {
                type: "transcript",
                label: "Academic Transcript (Optional)",
                required: false,
                multiple: true
            },
            {
                type: "additional_certificate",
                label: "Additional Professional Certificates / References (Optional)",
                required: false,
                multiple: true
            }
        ];

        function renderUploadedDocuments() {
            documentList.replaceChildren();

            if (!uploadedDocuments.length) {
                documentList.appendChild(
                    element(
                        "p",
                        "empty-state",
                        "No documents uploaded yet."
                    )
                );
                return;
            }

            uploadedDocuments.forEach(document => {
                const item = element("div", "uploaded-document-item");

                const details = element("div", "uploaded-document-details");

                details.appendChild(
                    element("strong", "", document.fileName)
                );

                details.appendChild(
                    element(
                        "small",
                        "",
                        `${document.documentType.replaceAll("_", " ")} · ${formatFileSize(document.fileSize)}`
                    )
                );

                const removeButton = element(
                    "button",
                    "small-button decline",
                    "Remove"
                );

                removeButton.type = "button";

                removeButton.addEventListener("click", async () => {
                    removeButton.disabled = true;
                    removeButton.textContent = "Removing...";

                    try {
                        await applicationApi(
                            "delete-application-document",
                            {
                                applicationId,
                                documentId: document.documentId
                            }
                        );

                        const index = uploadedDocuments.findIndex(
                            item => item.documentId === document.documentId
                        );

                        if (index !== -1) {
                            uploadedDocuments.splice(index, 1);
                        }

                        renderUploadedDocuments();

                        showMessage("Document removed successfully.", "success");

                    } catch (error) {
                        console.error("Document removal failed:", error);

                        showMessage(
                            `Could not remove document: ${error.message}`,
                            "error"
                        );

                        removeButton.disabled = false;
                        removeButton.textContent = "Remove";
                    }
                });

                item.append(details, removeButton);
                documentList.appendChild(item);
            });
        }

        documentTypes.forEach(documentType => {
            const group = element("div", "feedback-group");

            const label = element(
                "label",
                "feedback-label",
                documentType.label + (documentType.required ? " *" : "")
            );

            const input = element("input", "feedback-input");

            input.type = "file";
            input.accept = documentType.type === "cv"
                ? ".pdf,application/pdf"
                : ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

            input.multiple = documentType.multiple;

            label.appendChild(input);
            group.appendChild(label);

            const uploadStatus = element("p", "item-date", "");

            group.appendChild(uploadStatus);

            input.addEventListener("change", async () => {
                const files = Array.from(input.files || []);

                if (!files.length) return;

                const existingOfType = uploadedDocuments.filter(
                    item => item.documentType === documentType.type
                );

                if (
                    !documentType.multiple &&
                    existingOfType.length > 0
                ) {
                    showMessage(
                        `You have already uploaded your ${documentType.label}. Remove it before uploading another.`,
                        "error"
                    );

                    input.value = "";
                    return;
                }

                if (
                    uploadedDocuments.length + files.length > MAX_DOCUMENTS
                ) {
                    showMessage(
                        `You can upload a maximum of ${MAX_DOCUMENTS} documents.`,
                        "error"
                    );

                    input.value = "";
                    return;
                }

                input.disabled = true;

                try {
                    for (const file of files) {
                        validateApplicationFile(file, documentType.type);

                        uploadStatus.textContent =
                            `Uploading ${file.name}...`;

                        // 1. Request temporary upload permission.
                        const uploadPermission = await applicationApi(
                            "create-upload-url",
                            {
                                applicationId,
                                documentType: documentType.type,
                                fileName: file.name,
                                mimeType: file.type,
                                fileSize: file.size
                            }
                        );

                        const storagePath = uploadPermission.storagePath;
                        const uploadToken = uploadPermission.uploadToken;

                        if (!storagePath || !uploadToken) {
                            throw new Error(
                                "The server did not return valid upload permission."
                            );
                        }

                        // 2. Upload directly to the private Supabase bucket.
                        const { error: uploadError } = await supabase.storage
                            .from(uploadPermission.bucket || STORAGE_BUCKET)
                            .uploadToSignedUrl(
                                storagePath,
                                uploadToken,
                                file
                            );

                        if (uploadError) {
                            throw uploadError;
                        }

                        // 3. Register and verify the uploaded document.
                        const registration = await applicationApi(
                            "register-application-document",
                            {
                                applicationId,
                                storagePath,
                                documentType: documentType.type,
                                fileName: file.name,
                                mimeType: file.type,
                                fileSize: file.size
                            }
                        );

                        const savedDocument =
                            registration.document || registration;

                        const documentId =
                            savedDocument.documentId ||
                            registration.documentId ||
                            storagePath.split("/").pop().split(".")[0];

                        uploadedDocuments.push({
                            documentId,
                            documentType: documentType.type,
                            fileName: file.name,
                            fileSize: file.size,
                            mimeType: file.type,
                            storagePath
                        });

                        renderUploadedDocuments();
                    }

                    uploadStatus.textContent = "Upload complete.";

                    showMessage(
                        "Your document(s) uploaded successfully.",
                        "success"
                    );

                } catch (error) {
                    console.error("Document upload failed:", error);

                    uploadStatus.textContent = "";

                    showMessage(
                        `Document upload failed: ${error.message}`,
                        "error"
                    );

                } finally {
                    input.disabled = false;
                    input.value = "";
                }
            });

            documentSection.appendChild(group);
        });

        renderUploadedDocuments();

        form.appendChild(documentSection);

        // ------------------------------------
        // FORM ACTIONS
        // ------------------------------------

        const actions = element("div", "item-actions");

        const submitButton = element(
            "button",
            "small-button accept",
            "Submit Application"
        );

        submitButton.type = "submit";

        const cancelButton = element(
            "button",
            "small-button decline",
            "Cancel"
        );

        cancelButton.type = "button";

        cancelButton.addEventListener("click", () => {
            form.remove();
        });

        actions.append(submitButton, cancelButton);
        form.appendChild(actions);

        form.addEventListener("submit", async event => {
            event.preventDefault();

            await submitFirmApplication(
                firm,
                form,
                submitButton,
                uploadedDocuments
            );
        });

        card.appendChild(form);

        clearMessage();

    } catch (error) {
        console.error("Could not prepare application:", error);

        showMessage(
            `Could not prepare your application: ${error.message}`,
            "error"
        );
    }
}


// ============================================
// SUBMIT APPLICATION
// ============================================

async function submitFirmApplication(
    firm,
    form,
    button,
    uploadedDocuments
) {
    if (!currentUser || !currentProfile) return;

    const lawyerName = currentProfile.fullName || "";
    const practiceArea = currentProfile.practiceArea || "";
    const barAdmissionNumber =
        currentProfile.barAdmissionNumber || "";

    if (!lawyerName || !practiceArea || !barAdmissionNumber) {
        showMessage(
            "Complete your professional profile, including your Bar Admission Number, before applying.",
            "error"
        );
        return;
    }

    const qualifications =
        form.elements.qualifications.value.trim();

    const experience =
        form.elements.experience.value.trim();

    const coverLetter =
        form.elements.coverLetter.value.trim();

    if (!qualifications || !experience || !coverLetter) {
        showMessage(
            "Please complete all application fields.",
            "error"
        );
        return;
    }

    const hasCV = uploadedDocuments.some(
        item => item.documentType === "cv"
    );

    const hasAcademicCertificate = uploadedDocuments.some(
        item => item.documentType === "academic_certificate"
    );

    if (!hasCV || !hasAcademicCertificate) {
        showMessage(
            "Please upload both your CV and at least one academic certificate.",
            "error"
        );
        return;
    }

    button.disabled = true;
    button.textContent = "Submitting...";

    try {
        const applicationId = form.dataset.applicationId;

        await applicationApi(
            "submit-firm-application",
            {
                applicationId,
                qualifications,
                experience,
                coverLetter
            }
        );

        form.remove();

        await loadMyApplications();

        showMessage(
            `Your application to ${firm.firmName} was submitted successfully.`,
            "success"
        );

    } catch (error) {
        console.error("Application submission failed:", error);

        showMessage(
            `Could not submit your application: ${error.message}`,
            "error"
        );

    } finally {
        button.disabled = false;
        button.textContent = "Submit Application";
    }
}


// Load applications submitted by the logged-in lawyer
async function loadMyApplications() {

    const container = $("applicationsList");

    showEmpty(container, "Loading your applications...");

    try {
        const applicationQuery = query(
            collection(db, "firmApplications"),
            where("lawyerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(applicationQuery);

        firmApplications = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        firmApplications.sort((a, b) =>
            toMillis(b.submittedAt) - toMillis(a.submittedAt)
        );

        renderMyApplications();

    } catch (error) {
        console.error("Could not load firm applications:", error);

        showEmpty(
            container,
            "Your applications could not be loaded. Check your Firestore rules."
        );
    }
}


// Render the lawyer's applications
function renderMyApplications() {

    const container = $("applicationsList");

    if (!container) return;

    if (!firmApplications.length) {
        showEmpty(
            container,
            "You have not applied to any law firms yet."
        );
        return;
    }

    const cards = firmApplications.map(application => {

        const card = element("article", "data-item");
        const main = element("div", "data-item-main");

        const firm = publicFirms.find(
            item => item.id === application.firmId
        );

        main.appendChild(
            element(
                "h3",
                "",
                firm?.firmName || "Law Firm"
            )
        );

        main.appendChild(
            element(
                "p",
                "",
                `Applied: ${formatDate(application.submittedAt)}`
            )
        );

        main.appendChild(
            element(
                "p",
                "",
                `Practice area: ${application.practiceArea || "Not provided"}`
            )
        );

        main.appendChild(
            makeStatus(application.status)
        );

        if (application.decisionNote) {
            const note = element("div", "saved-feedback");

            note.appendChild(
                element("strong", "", "Firm response")
            );

            note.appendChild(
                element("p", "", application.decisionNote)
            );

            main.appendChild(note);
        }

        if (normaliseStatus(application.status) === "pending") {

            const withdrawButton = element(
                "button",
                "small-button decline",
                "Withdraw Application"
            );

            withdrawButton.type = "button";

            withdrawButton.addEventListener("click", () => {
                withdrawFirmApplication(
                    application,
                    withdrawButton
                );
            });

            main.appendChild(withdrawButton);
        }

        card.appendChild(main);

        return card;
    });

    container.replaceChildren(...cards);
}


// Withdraw a pending application
async function withdrawFirmApplication(application, button) {

    if (!currentUser) return;

    if (normaliseStatus(application.status) !== "pending") {
        showMessage(
            "Only pending applications can be withdrawn.",
            "error"
        );
        return;
    }

    const confirmed = window.confirm(
        "Are you sure you want to withdraw this application?"
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Withdrawing...";

    try {
        await updateDoc(
            doc(db, "firmApplications", application.id),
            {
                status: "withdrawn",
                withdrawnAt: serverTimestamp()
            }
        );

        application.status = "withdrawn";

        renderMyApplications();

        showMessage(
            "Your application has been withdrawn.",
            "success"
        );

    } catch (error) {
        console.error("Could not withdraw application:", error);

        showMessage(
            `Could not withdraw application: ${error.message}`,
            "error"
        );

        button.disabled = false;
        button.textContent = "Withdraw Application";
    }
}


// Search law firms
$("firmSearch")?.addEventListener("input", renderPublicFirms);


$("appointmentSearch")?.addEventListener("input", renderAppointments);
$("appointmentStatusFilter")?.addEventListener("change", renderAppointments);


// ============================================
// LOAD CONVERSATIONS
//
// Expected collection: conversations
// Expected fields:
// lawyerId, clientId, clientName, lastMessage,
// updatedAt
// Messages live in conversations/{id}/messages
// ============================================
function getLawyerUnreadCount() {
                return conversations.reduce((total, conversation) => {
                    return total + (Number(conversation.lawyerUnreadCount) || 0);
                }, 0);
            }
function listenForLawyerConversations() {

    if (unsubscribeConversations) {
        unsubscribeConversations();
    }

    const conversationQuery = query(
        collection(db, "conversations"),
        where("lawyerId", "==", currentUser.uid)
    );

    unsubscribeConversations = onSnapshot(
        conversationQuery,

        snapshot => {

            conversations = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            }));

            conversations.sort((a, b) => {
                return toMillis(b.updatedAt) - toMillis(a.updatedAt);
            });

            

            renderConversations();
            updateStatistics();
        },

        error => {
            console.error(
                "Could not listen for conversations:",
                error
            );

            showMessage(
                "Unable to update your conversations.",
                "error"
            );
        }
    );
}

function renderConversations() {
    const container = $("conversationsList");

    if (!conversations.length) {
        showEmpty(container, "No client conversations yet.");
        setText("messageNavCount", "0");
        return;
    }

    const items = conversations.map((conversation) => {
        const button = element(
            "button",
            `conversation-item ${conversation.id === selectedConversationId ? "selected" : ""}`
        );

        button.type = "button";

        // Group conversation details together.
        const info = element("div", "conversation-info");

        info.appendChild(element(
            "strong",
            "",
            conversation.clientName || "HakiLink client"
        ));

        info.appendChild(element(
            "span",
            "",
            conversation.lastMessage || "No messages yet"
        ));

        info.appendChild(element(
            "p",
            "",
            formatDate(conversation.updatedAt)
        ));

        button.appendChild(info);

        // Display unread count on the right.
        const unread = Number(conversation.lawyerUnreadCount) || 0;

        if (unread > 0) {
            button.classList.add("has-unread");

            button.appendChild(
                element(
                    "span",
                    "conversation-unread-count",
                    unread > 99 ? "99+" : String(unread)
                )
            );
        }

        button.addEventListener("click", () => {
            selectConversation(conversation);
        });

        return button;
    });

    container.replaceChildren(...items);
}


async function selectConversation(conversation) {
    selectedConversationId = conversation.id;
    // Mark messages as read by the lawyer.
        try {
            await updateDoc(
                doc(db, "conversations", conversation.id),
                {
                    lawyerUnreadCount: 0
                }
            );

            conversation.lawyerUnreadCount = 0;

        } catch (error) {
            console.error("Could not reset lawyer unread count:", error);
        }
    const loadToken = ++conversationLoadToken;

    renderConversations();

    const header = $("chatHeader");
    header.replaceChildren();

    const avatar = element(
        "div",
        "avatar",
        getInitials(conversation.clientName || "Client")
    );

    const details = element("div");
    details.appendChild(element(
        "strong",
        "",
        conversation.clientName || "HakiLink client"
    ));
    details.appendChild(element(
        "span",
        "",
        "Client conversation"
    ));

    header.append(avatar, details);

    $("messageInput").disabled = false;
    $("sendMessageButton").disabled = false;

    const container = $("messagesList");
    showEmpty(container, "Loading messages...");

    try {
        const messagesQuery = query(
            collection(
                db,
                "conversations",
                conversation.id,
                "messages"
            ),
            orderBy("createdAt", "asc")
        );

        const snapshot = await getDocs(messagesQuery);

        if (loadToken !== conversationLoadToken) return;

        const messages = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
        }));

        if (!messages.length) {
            showEmpty(container, "No messages in this conversation yet.");
            return;
        }

        container.replaceChildren();

        messages.forEach((message) => {
            const mine = message.senderId === currentUser.uid;

            const bubble = element(
                "div",
                `message-bubble ${mine ? "mine" : ""}`
            );

            bubble.appendChild(
                element("div", "", message.text || "")
            );

            bubble.appendChild(
                element("span", "message-meta", formatDate(message.createdAt))
            );

            container.appendChild(bubble);
        });

        container.scrollTop = container.scrollHeight;

    } catch (error) {
        console.error("Could not load messages:", error);

        if (loadToken === conversationLoadToken) {
            showEmpty(
                container,
                "Messages could not be loaded. Check the conversation's Firestore permissions."
            );
        }
    }
}


// ============================================
// SEND MESSAGE
// ============================================

messageForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !selectedConversationId) {
        showMessage("Select a client conversation first.", "info");
        return;
    }

    const input = $("messageInput");
    const sendButton = $("sendMessageButton");
    const text = input.value.trim();

    if (!text) return;

    const conversation = conversations.find(
        item => item.id === selectedConversationId
    );

    if (!conversation) return;

    sendButton.disabled = true;

    try {
        // STEP 1: Save the actual message.
        console.log("Step 1: Saving message...");

        await addDoc(
            collection(
                db,
                "conversations",
                conversation.id,
                "messages"
            ),
            {
                senderId: currentUser.uid,
                text,
                createdAt: serverTimestamp()
            }
        );
        // Display the sent message immediately in the lawyer's chat.
        const container = $("messagesList");

        const bubble = element(
            "div",
            "message-bubble mine"
        );

        bubble.appendChild(
            element("div", "", text)
        );

        bubble.appendChild(
            element("span", "message-meta", formatDate(new Date()))
        );

        container.appendChild(bubble);

        // Scroll to the latest message.
        container.scrollTop = container.scrollHeight;

        console.log("Step 1 successful: Message saved.");

        // STEP 2: Update conversation and unread count.
        console.log("Step 2: Updating conversation...");

        await updateDoc(
            doc(db, "conversations", conversation.id),
            {
                lastMessage: text,
                updatedAt: serverTimestamp(),
                clientUnreadCount: increment(1)
            }
        );

        console.log("Step 2 successful: Conversation updated.");

        input.value = "";
        resizeMessageInput();

    } catch (error) {
        console.error("Message operation failed:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);

        showMessage(
            "A message operation failed. Check the console for details.",
            "error"
        );

    } finally {
        sendButton.disabled = false;
    }
});


// ============================================
// DASHBOARD STATISTICS
// ============================================

function updateStatistics() {
    const pendingCount = requests.filter(
        (request) => normaliseStatus(request.status) === "pending"
    ).length;

    const now = Date.now();

    const upcomingCount = appointments.filter((appointment) => {
        return toMillis(appointment.dateTime) >= now &&
            !["cancelled", "completed"].includes(
                normaliseStatus(appointment.status)
            );
    }).length;

    setText("pendingRequestsCount", pendingCount);
    setText("upcomingAppointmentsCount", upcomingCount);
    setText("conversationsCount", conversations.length);

    setText("requestNavCount", pendingCount);
    setText("messageNavCount", getLawyerUnreadCount());
}


// ============================================
// LOGOUT
// ============================================

logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
        await signOut(auth);
        window.location.replace("../pages/login.html");
    } catch (error) {
        console.error("Logout failed:", error);
        showMessage("Unable to sign out. Please try again.", "error");
        logoutButton.disabled = false;
    }
});


// ============================================
// AUTHENTICATION AND INITIALISATION
// ============================================


// ============================================
// AUTHENTICATION AND INITIALISATION
// ============================================

onAuthStateChanged(auth, async (user) => {

    if (!user) {

        // Stop notification listener when logged out.
        if (unsubscribeNotifications) {
            unsubscribeNotifications();
            unsubscribeNotifications = null;
        }

        lawyerNotifications = [];
        currentUser = null;

        window.location.replace("../pages/login.html");
        return;
    }

    currentUser = user;

    try {

        await loadProfile(user);

        // Start real-time lawyer notifications.
        listenForLawyerNotifications(user);

        // Load dashboard sections independently.
        await Promise.allSettled([
            loadRequests(),
            loadAppointments(),
            listenForLawyerConversations(),
            loadPublicFirms(),
            loadMyApplications()
        ]);

    } catch (error) {

        console.error("Dashboard initialisation failed:", error);

        showMessage(
            error.message || "Unable to load your lawyer dashboard.",
            "error"
        );
    }
});

