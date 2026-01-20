const memberName = document.getElementById("member-name");
const memberRole = document.getElementById("member-role");
const memberSave = document.getElementById("member-save");
const memberReset = document.getElementById("member-reset");
const memberState = document.getElementById("member-state");
const memberTable = document.getElementById("member-table");
const downloadDataBtn = document.getElementById("download-data");
const uploadDataBtn = document.getElementById("upload-data");
const fileInput = document.getElementById("file-input");

let data = { members: [], slots: [] };
let editingMemberId = null;

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;
}

async function loadInitialData() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      if (json.members && json.slots) data = json;
    }
  } catch (e) {
    console.warn("Could not load data.json, starting empty.", e);
  }
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
  memberState.textContent = "Ready to add new member.";
  memberSave.textContent = "Save Member";
}

function renderMembers() {
  memberTable.innerHTML = "";
  if (!data.members.length) {
    memberTable.innerHTML = `<tr><td colspan="3" class="empty">No members yet.</td></tr>`;
    return;
  }

  data.members.forEach((m) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><a class="link" href="member.html?id=${m.id}">${m.name}</a></td>
      <td>${m.role || "—"}</td>
      <td>
        <div class="stack">
          <button class="btn btn-ghost" data-action="edit" data-id="${m.id}">Edit</button>
          <button class="btn btn-ghost" data-action="remove" data-id="${m.id}">Remove</button>
        </div>
      </td>
    `;
    memberTable.appendChild(row);
  });
}

function handleMemberSave() {
  const name = memberName.value.trim();
  if (!name) {
    alert("Name is required.");
    return;
  }
  const role = memberRole.value.trim();

  if (editingMemberId) {
    const member = data.members.find((m) => m.id === editingMemberId);
    if (member) {
      member.name = name;
      member.role = role;
    }
  } else {
    data.members.push({ id: generateId(), name, role });
  }
  renderMembers();
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
    memberState.textContent = "Editing member — save to apply changes.";
    memberSave.textContent = "Update Member";
  } else if (action === "remove") {
    const inUse = data.slots.some((s) => s.memberId === id);
    if (inUse && !confirm("Remove member and all related time slots?")) return;
    data.slots = data.slots.filter((s) => s.memberId !== id);
    data.members = data.members.filter((m) => m.id !== id);
    renderMembers();
    resetForm();
  }
}

async function init() {
  await loadInitialData();
  renderMembers();
  resetForm();

  memberSave.addEventListener("click", handleMemberSave);
  memberReset.addEventListener("click", resetForm);
  memberTable.addEventListener("click", handleTableClick);
  downloadDataBtn.addEventListener("click", downloadData);
  uploadDataBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileChange);
}

document.addEventListener("DOMContentLoaded", init);
