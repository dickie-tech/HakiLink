
/* =========================================
   HAKILINK LAW FIRM DASHBOARD
   Basic navigation and interactions
========================================= */

const navLinks = document.querySelectorAll(".nav-link");
const dashboardSections = document.querySelectorAll(".dashboard-section");

const welcomeHeading = document.getElementById("welcomeHeading");
const addLawyerButton = document.getElementById("addLawyerButton");

// DASHBOARD NAVIGATION
function openSection(sectionId) {
    const targetSection = document.getElementById(sectionId);

    if (!targetSection || !targetSection.classList.contains("dashboard-section")) {
        return;
    }

    // Hide all sections
    dashboardSections.forEach(section => {
        section.classList.remove("active");
    });

    // Remove active state from navigation
    navLinks.forEach(link => {
        link.classList.remove("active");
        link.removeAttribute("aria-current");
    });

    // Show selected section
    targetSection.classList.add("active");

    // Highlight selected navigation item
    const activeLink = document.querySelector(
        `.nav-link[data-section="${sectionId}"]`
    );

    if (activeLink) {
        activeLink.classList.add("active");
        activeLink.setAttribute("aria-current", "page");
    }

    // Update page heading
    const sectionHeading = targetSection.querySelector("h2");

    if (welcomeHeading && sectionHeading) {
        welcomeHeading.textContent = sectionHeading.textContent;
    }

    // Return to the top of the content
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// NAVIGATION CLICK EVENTS
navLinks.forEach(link => {
    link.addEventListener("click", () => {
        const sectionId = link.dataset.section;

        openSection(sectionId);
    });
});

// ADD LAWYER BUTTON
addLawyerButton?.addEventListener("click", () => {
    showToast(
        "Lawyer management will be connected to Firebase in the next stage."
    );
});

// SIMPLE TOAST MESSAGE
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

// INITIAL DASHBOARD STATE
openSection("overview");
