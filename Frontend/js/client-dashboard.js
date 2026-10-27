
/* ============================================
   HAKILINK CLIENT DASHBOARD
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
    getDocs
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


// ============================================
// LAWYER DIRECTORY DATA
// ============================================

let lawyers = [];


// ============================================
// GET INITIALS
// ============================================

function getInitials(name) {
    if (!name) return "HL";

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
            userData.fullName || user.displayName || "HakiLink User";

        const email = userData.email || user.email || "No email";
        const phone = userData.phone || "Not provided";

        if (welcomeName) welcomeName.textContent = fullName;
        if (topbarUserName) topbarUserName.textContent = fullName;
        if (profileName) profileName.textContent = fullName;
        if (profileFullName) profileFullName.textContent = fullName;
        if (profileEmail) profileEmail.textContent = email;
        if (profilePhone) profilePhone.textContent = phone;

        const initials = getInitials(fullName);

        if (userAvatar) userAvatar.textContent = initials;
        if (profileAvatar) profileAvatar.textContent = initials;

    } catch (error) {
        console.error("Error loading client profile:", error);
    }
}


// ============================================
// LOAD LAWYERS FROM FIRESTORE
// ============================================

async function loadLawyers() {
    if (!lawyersGrid) return;

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
    if (!lawyersGrid) return;

    const searchTerm = lawyerSearch
        ? lawyerSearch.value.trim().toLowerCase()
        : "";

    const selectedPractice = practiceFilter
        ? practiceFilter.value
        : "";

    const filteredLawyers = lawyers.filter((lawyer) => {
        const name = lawyer.fullName.toLowerCase();
        const area = lawyer.practiceArea.toLowerCase();

        const matchesSearch =
            name.includes(searchTerm) ||
            area.includes(searchTerm);

        const matchesPractice =
            !selectedPractice ||
            selectedPractice.toLowerCase() === area;

        return matchesSearch && matchesPractice;
    });

    lawyersGrid.replaceChildren();

    if (filteredLawyers.length === 0) {
        const emptyMessage = document.createElement("p");

        emptyMessage.className = "lawyers-empty";
        emptyMessage.textContent = lawyers.length === 0
            ? "No lawyers are listed yet. Please check back soon."
            : "No lawyers match your search. Try another name or practice area.";

        lawyersGrid.appendChild(emptyMessage);
        return;
    }

    filteredLawyers.forEach((lawyer) => {
        const card = document.createElement("article");
        card.className = "lawyer-card";

        const avatar = document.createElement("div");
        avatar.className = "lawyer-avatar";
        avatar.textContent = getInitials(lawyer.fullName);

        const name = document.createElement("h3");
        name.className = "lawyer-name";
        name.textContent = lawyer.fullName;

        const specialty = document.createElement("p");
        specialty.className = "lawyer-specialty";
        specialty.textContent = lawyer.practiceArea;

        const description = document.createElement("p");
        description.className = "lawyer-description";
        description.textContent =
            "Legal professional listed on HakiLink.";

        card.append(avatar, name, specialty, description);
        lawyersGrid.appendChild(card);
    });
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
// AUTHENTICATION STATE
// ============================================

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../auth/login.html";
        return;
    }

    await loadClientProfile(user);
    await loadLawyers();
});


// ============================================
// LOGOUT
// ============================================

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = "../auth/login.html";
        } catch (error) {
            console.error("Logout error:", error);
            alert("Unable to log out. Please try again.");
        }
    });
}
