
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
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


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

    if (typeof value.toDate === "function") {
        date = value.toDate();
    } else if (typeof value === "string" || typeof value === "number") {
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
// NAVIGATION
// ============================================

const sectionTitles = {
    overview: "Overview",
    requests: "Client Requests",
    appointments: "Appointments",
    messages: "Messages",
    profile: "Professional Profile"
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

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Saving...";

    try {
        await updateDoc(
            doc(db, "consultationRequests", requestId),
            {
                status,
                lawyerFeedback,
                updatedAt: serverTimestamp()
            }
        );

        const request = requests.find(
            (item) => item.id === requestId
        );

        if (request) {
            request.status = status;
            request.lawyerFeedback = lawyerFeedback;
        }

        renderRequests();
        updateStatistics();

        showMessage(
            `Request ${status}. Feedback saved successfully.`,
            "success"
        );

    } catch (error) {
        console.error("Could not update request:", error);

        showMessage(
            "We couldn't update this request. Check your Firestore security rules.",
            "error"
        );

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

async function loadConversations() {
    const container = $("conversationsList");

    showEmpty(container, "Loading conversations...");

    try {
        const conversationQuery = query(
            collection(db, "conversations"),
            where("lawyerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(conversationQuery);

        conversations = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
        }));

        conversations.sort((a, b) => {
            return toMillis(b.updatedAt) - toMillis(a.updatedAt);
        });

        renderConversations();
        updateStatistics();

    } catch (error) {
        console.error("Could not load conversations:", error);

        showEmpty(
            container,
            "Messages could not be loaded. Check your Firestore rules and conversation data."
        );
    }
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
        button.appendChild(element(
            "strong",
            "",
            conversation.clientName || "HakiLink client"
        ));

        button.appendChild(element(
            "span",
            "",
            conversation.lastMessage || "No messages yet"
        ));

        button.appendChild(element(
            "p",
            "",
            formatDate(conversation.updatedAt)
        ));

        button.addEventListener("click", () => {
            selectConversation(conversation);
        });

        return button;
    });

    container.replaceChildren(...items);
}

async function selectConversation(conversation) {
    selectedConversationId = conversation.id;
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
        (item) => item.id === selectedConversationId
    );

    if (!conversation) return;

    sendButton.disabled = true;

    try {
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

        await updateDoc(
            doc(db, "conversations", conversation.id),
            {
                lastMessage: text,
                updatedAt: serverTimestamp()
            }
        );

        input.value = "";

        conversation.lastMessage = text;
        conversation.updatedAt = new Date();

        await selectConversation(conversation);
        renderConversations();

    } catch (error) {
        console.error("Could not send message:", error);

        showMessage(
            "Your message could not be sent. Check your Firestore rules and try again.",
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
    setText("messageNavCount", conversations.length);
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

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("../pages/login.html");
        return;
    }

    currentUser = user;

    try {
        await loadProfile(user);

        // Load each section independently so one missing collection
        // doesn't prevent the other dashboard sections from working.
        await Promise.allSettled([
            loadRequests(),
            loadAppointments(),
            loadConversations()
        ]);

    } catch (error) {
        console.error("Dashboard initialisation failed:", error);

        showMessage(
            error.message || "Unable to load your lawyer dashboard.",
            "error"
        );
    }
});
