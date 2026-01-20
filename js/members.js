const storageKey = "resourcePlannerData";
const memberName = document.getElementById("member-name");
const memberRole = document.getElementById("member-role");
const memberLevel = document.getElementById("member-level");
const memberSave = document.getElementById("member-save");
const memberReset = document.getElementById("member-reset");
const memberState = document.getElementById("member-state");
const memberTable = document.getElementById("member-table");
const memberFilterBtn = document.getElementById("member-filter-btn");
const memberFilterMenu = document.getElementById("member-filter-menu");
const downloadDataBtn = document.getElementById("download-data");
const uploadDataBtn = document.getElementById("upload-data");
const fileInput = document.getElementById("file-input");
const toastEl = document.getElementById("toast");
const confirmBackdrop = document.getElementById("confirm");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");
const themeToggle = document.getElementById("theme-toggle");

let data = { members: [], slots: [], projects: [] };
let editingMemberId = null;
let currentFilter = "all";
let confirmResolver = null;
let themeMode = "light";

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;
}

function normalizeData() {
  data.members = data.members || [];
  data.slots = data.slots || [];
  data.projects = data.projects || [];
  data.members.forEach((m) => {
    if (!m.level) m.level = "Unspecified";
  });
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) data = JSON.parse(raw);
  } catch (e) {
    console.warn("Could not read localStorage, starting empty.", e);
  }
  normalizeData();
}

function saveToStorage() {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function applyTheme(mode) {
  document.body.classList.toggle("dark", mode === "dark");
  localStorage.setItem("theme", mode);
  themeMode = mode;
  if (themeToggle) themeToggle.textContent = mode === "dark" ? "Light Mode" : "Dark Mode";
}

function initTheme() {
  const stored = localStorage.getItem("theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (prefersDark ? "dark" : "light"));
}

function showToast(message, isError = false) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.toggle("error", isError);
  toastEl.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.remove("show"), 2000);
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    confirmTitle.textContent = "Please Confirm";
    confirmMessage.textContent = message;
    confirmBackdrop.classList.add("active");
  });
}

function downloadData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.json";
  a.click();
  URL.revokeObjectURL(url);
}

function handleFileChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      if (!json.members || !json.slots) throw new Error("Missing members or slots keys.");
      data = json;
      normalizeData();
      saveToStorage();
      renderMembers();
      resetForm();
    } catch (err) {
      alert("Invalid JSON file.");
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function resetForm() {
  editingMemberId = null;
  memberName.value = "";
  memberRole.value = "";
  memberLevel.value = "Junior";
  memberState.textContent = "Ready to add new member.";
  memberSave.textContent = "Save Member";
}

function renderMembers() {
  memberTable.innerHTML = "";
  const list =
    currentFilter && currentFilter !== "all"
      ? data.members.filter((m) => (m.level || "Unspecified") === currentFilter)
      : data.members;

  if (!list.length) {
    memberTable.innerHTML = `<tr><td colspan="4" class="empty">No members yet.</td></tr>`;
    return;
  }

  list.forEach((m) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><a class="link" href="member.html?id=${m.id}">${m.name}</a></td>
      <td>${m.role || "—"}</td>
      <td>${m.level || "Unspecified"}</td>
      <td>
        <div class="stack">
          <button class="btn btn-ghost icon-btn" aria-label="Edit member" data-action="edit" data-id="${m.id}">&#9998;</button>
          <button class="btn btn-ghost icon-btn" aria-label="Delete member" data-action="remove" data-id="${m.id}">&#128465;</button>
        </div>
      </td>
    `;
    memberTable.appendChild(row);
  });
}

function handleMemberSave() {
  const name = memberName.value.trim();
  if (!name) {
    showToast("Name is required.", true);
    return;
  }
  const role = memberRole.value.trim();
  const level = memberLevel.value || "Unspecified";

  if (editingMemberId) {
    const member = data.members.find((m) => m.id === editingMemberId);
    if (member) {
      member.name = name;
      member.role = role;
      member.level = level;
    }
  } else {
    data.members.push({ id: generateId(), name, role, level });
  }
  renderMembers();
  saveToStorage();
  showToast(editingMemberId ? "Member updated." : "Member added.");
  resetForm();
}

function handleTableClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "edit") {
    const member = data.members.find((m) => m.id === id);
    if (!member) return;
    editingMemberId = id;
    memberName.value = member.name;
    memberRole.value = member.role;
    memberLevel.value = member.level || "Unspecified";
    memberState.textContent = "Editing member — save to apply changes.";
    memberSave.textContent = "Update Member";
  } else if (action === "remove") {
    const inUse = data.slots.some((s) => s.memberId === id);
    const message = inUse ? "Remove member and all related time slots?" : "Remove this member?";
    confirmDialog(message).then((ok) => {
      if (!ok) return;
      data.slots = data.slots.filter((s) => s.memberId !== id);
      data.members = data.members.filter((m) => m.id !== id);
      saveToStorage();
      renderMembers();
      resetForm();
      showToast("Member deleted.");
    });
  }
}

async function init() {
  loadFromStorage();
  renderMembers();
  resetForm();

  memberSave.addEventListener("click", handleMemberSave);
  memberReset.addEventListener("click", resetForm);
  memberTable.addEventListener("click", handleTableClick);
  if (memberFilterBtn && memberFilterMenu) {
    memberFilterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = memberFilterMenu.classList.contains("show");
      memberFilterMenu.classList.toggle("show", !isOpen);
      memberFilterBtn.setAttribute("aria-expanded", (!isOpen).toString());
      if (!isOpen) {
        const rect = memberFilterBtn.getBoundingClientRect();
        memberFilterMenu.style.top = `${rect.bottom + 4}px`;
        memberFilterMenu.style.left = `${rect.left}px`;
        [...memberFilterMenu.querySelectorAll("button[data-value]")].forEach((b) =>
          b.classList.toggle("active", b.dataset.value === currentFilter)
        );
      }
    });
    memberFilterMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-value]");
      if (!btn) return;
      currentFilter = btn.dataset.value;
      memberFilterMenu.classList.remove("show");
      memberFilterBtn.setAttribute("aria-expanded", "false");
      memberFilterMenu.style.top = "";
      memberFilterMenu.style.left = "";
      renderMembers();
      [...memberFilterMenu.querySelectorAll("button[data-value]")].forEach((b) =>
        b.classList.toggle("active", b.dataset.value === currentFilter)
      );
    });
    document.addEventListener("click", (e) => {
      if (!memberFilterMenu.classList.contains("show")) return;
      if (!memberFilterMenu.contains(e.target) && e.target !== memberFilterBtn) {
        memberFilterMenu.classList.remove("show");
        memberFilterBtn.setAttribute("aria-expanded", "false");
        memberFilterMenu.style.top = "";
        memberFilterMenu.style.left = "";
      }
    });
  }
  confirmYes.addEventListener("click", () => {
    confirmBackdrop.classList.remove("active");
    if (confirmResolver) confirmResolver(true);
    confirmResolver = null;
  });
  confirmNo.addEventListener("click", () => {
    confirmBackdrop.classList.remove("active");
    if (confirmResolver) confirmResolver(false);
    confirmResolver = null;
  });
  confirmBackdrop.addEventListener("click", (e) => {
    if (e.target === confirmBackdrop) {
      confirmBackdrop.classList.remove("active");
      if (confirmResolver) confirmResolver(false);
      confirmResolver = null;
    }
  });
  if (themeToggle) {
    themeToggle.addEventListener("click", () => applyTheme(themeMode === "dark" ? "light" : "dark"));
  }
  initTheme();
  downloadDataBtn.addEventListener("click", downloadData);
  uploadDataBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileChange);
}

document.addEventListener("DOMContentLoaded", init);
