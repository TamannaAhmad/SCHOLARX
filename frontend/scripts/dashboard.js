// ===============================
// ScholarX Dashboard - v8 Enhanced
// Dark/Light Theme + Shimmer Entry Animation
// ===============================

const API_BASE = window.location.origin.includes("localhost")
  ? "http://127.0.0.1:8000"
  : window.location.origin;

const projectsList = document.getElementById("user-projects-list");
const groupsList = document.getElementById("user-study-groups-list");
const statProjects = document.getElementById("statProjects");
const statGroups = document.getElementById("statGroups");
const statMessages = document.getElementById("statMessages");
const userNameEl = document.getElementById("userName");
const userAvatar = document.querySelector(".hero-img");
const userInitialsEl = document.getElementById("userInitials");

// ---------------------------
//  DEFAULT INLINE AVATAR
// ---------------------------
const defaultAvatarSVG = `data:image/svg+xml;base64,${btoa(`
<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>
<circle cx='64' cy='64' r='64' fill='%23205295'/>
<circle cx='64' cy='48' r='26' fill='white'/>
<path d='M14 122c10-34 46-36 50-36s40 2 50 36' fill='white'/>
</svg>`)};`;

// ---------------------------
//  COUNTER ANIMATION
// ---------------------------
function animateCounter(el, value) {
  let start = 0;
  const increment = value / 60;
  const update = () => {
    start += increment;
    if (start >= value) {
      el.textContent = value;
    } else {
      el.textContent = Math.floor(start);
      requestAnimationFrame(update);
    }
  };
  requestAnimationFrame(update);
}

// ---------------------------
//  CREATE MINI CARD + SHIMMER
// ---------------------------
function createMiniCard(title, subtext) {
  const card = document.createElement("div");
  card.className = "mini-card scale-up shimmer-entry";
  card.innerHTML = `
    <div class="mini-card-title">${title}</div>
    <div class="mini-card-sub">${subtext}</div>
  `;
  // remove shimmer after a few seconds
  setTimeout(() => card.classList.remove("shimmer-entry"), 1200);
  return card;
}

// ---------------------------
//  REMOVE SKELETONS
// ---------------------------
function removeSkeletons(container) {
  container.querySelectorAll(".skeleton").forEach((s) => s.remove());
}

// ---------------------------
//  APPLY THEME (AUTO DETECT)
// ---------------------------
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.style.setProperty("--background", "#0b0f14");
    root.style.setProperty("--text", "#f1f5f9");
    root.style.setProperty("--primary", "#3db2ff");
    root.style.setProperty("--secondary", "#ffedda");
    root.style.setProperty("--accent", "#ffb830");
  } else {
    root.style.setProperty("--background", "#f3f6f9");
    root.style.setProperty("--text", "#040c16");
    root.style.setProperty("--primary", "#205295");
    root.style.setProperty("--secondary", "#2c74b3");
    root.style.setProperty("--accent", "#2c74b3");
  }
}

// Detect system theme
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
applyTheme(prefersDark.matches ? "dark" : "light");
prefersDark.addEventListener("change", (e) => {
  applyTheme(e.matches ? "dark" : "light");
});

// ---------------------------
//  FETCH DASHBOARD DATA
// ---------------------------
async function fetchDashboardData() {
  try {
    const [userRes, projectsRes, groupsRes, messagesRes] = await Promise.all([
      fetch(`${API_BASE}/api/accounts/me/`),
      fetch(`${API_BASE}/api/projects/user/`),
      fetch(`${API_BASE}/api/groups/user/`),
      fetch(`${API_BASE}/api/messages/unread/`),
    ]);

    const user = userRes.ok ? await userRes.json() : {};
    const projects = projectsRes.ok ? await projectsRes.json() : [];
    const groups = groupsRes.ok ? await groupsRes.json() : [];
    const messages = messagesRes.ok ? await messagesRes.json() : [];

    // --- Counters ---
    animateCounter(statProjects, projects.length || 0);
    animateCounter(statGroups, groups.length || 0);
    animateCounter(statMessages, messages.length || 0);

    // --- User ---
    userNameEl.textContent = user.full_name || user.username || "User";
    userInitialsEl.textContent =
      user.full_name?.[0]?.toUpperCase() ||
      user.username?.[0]?.toUpperCase() ||
      "U";

    // --- Avatar ---
    userAvatar.src = user.avatar_url || defaultAvatarSVG;
    userAvatar.loading = "lazy";
    userAvatar.alt = "User Avatar";

    // --- Projects ---
    removeSkeletons(projectsList);
    if (!projects.length) {
      projectsList.innerHTML = `<p style="color:#777;font-size:.9rem;">No projects yet.</p>`;
    } else {
      projects.forEach((p) => {
        const title = p.title || "Untitled Project";
        const members = p.member_count || 1;
        const mini = createMiniCard(title, `${members} member${members !== 1 ? "s" : ""}`);
        projectsList.appendChild(mini);
      });
    }

    // --- Groups ---
    removeSkeletons(groupsList);
    if (!groups.length) {
      groupsList.innerHTML = `<p style="color:#777;font-size:.9rem;">No groups joined.</p>`;
    } else {
      groups.forEach((g) => {
        const title = g.name || "Unnamed Group";
        const members = g.members?.length || 1;
        const mini = createMiniCard(title, `${members} participant${members !== 1 ? "s" : ""}`);
        groupsList.appendChild(mini);
      });
    }

  } catch (err) {
    console.error("Dashboard load failed:", err);
    removeSkeletons(projectsList);
    removeSkeletons(groupsList);
    projectsList.innerHTML = `<p style="color:#c00;">⚠ Unable to load data.</p>`;
  }
}

// ---------------------------
//  INIT
// ---------------------------
document.addEventListener("DOMContentLoaded", fetchDashboardData);
