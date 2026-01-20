const params = new URLSearchParams(window.location.search);
const memberId = params.get("id");

const memberTitle = document.getElementById("member-title");
const memberMeta = document.getElementById("member-meta");
const downloadDataBtn = document.getElementById("download-data");
const uploadDataBtn = document.getElementById("upload-data");
const fileInput = document.getElementById("file-input");

const slotProject = document.getElementById("slot-project");
const slotDay = document.getElementById("slot-day");
const slotStart = document.getElementById("slot-start");
const slotEnd = document.getElementById("slot-end");
const slotSave = document.getElementById("slot-save");
const slotReset = document.getElementById("slot-reset");
const slotState = document.getElementById("slot-state");
const slotTable = document.getElementById("slot-table");
const timeline = document.getElementById("timeline");

const modalBackdrop = document.getElementById("slot-modal");
const modalSummary = document.getElementById("modal-summary");
const modalProject = document.getElementById("modal-project");
const modalStart = document.getElementById("modal-start");
const modalEnd = document.getElementById("modal-end");
const modalSave = document.getElementById("modal-save");
const modalCancel = document.getElementById("modal-cancel");

const CHART_START = 9 * 60; // 09:00 in minutes
const CHART_END = 18 * 60 + 15; // 18:15 in minutes
const CHART_RANGE = CHART_END - CHART_START;
const PX_PER_MIN = 1;
const CHART_HEIGHT = CHART_RANGE * PX_PER_MIN;
const MIN_DRAG_MINUTES = 5;

let data = { members: [], slots: [] };
let member = null;
let editingSlotId = null;
let dragState = null;

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
      member = data.members.find((m) => m.id === memberId);
      if (!member) {
        memberMeta.textContent = "Member not found in uploaded data.";
        slotTable.innerHTML = `<tr><td colspan="4" class="empty">No slots to show.</td></tr>`;
        timeline.innerHTML = "";
      } else {
        updateMemberMeta();
        renderSlots();
        renderTimeline();
        resetSlotForm();
      }
    } catch (err) {
      alert("Invalid JSON file.");
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function updateMemberMeta() {
  memberTitle.textContent = member ? `Member: ${member.name}` : "Member Detail";
  memberMeta.textContent = member ? `${member.name} — ${member.role || "No role provided"}` : "Member not found.";
}

function resetSlotForm() {
  editingSlotId = null;
  slotProject.value = "";
  slotDay.value = "Monday";
  slotStart.value = "";
  slotEnd.value = "";
  slotState.textContent = "Ready to add slot.";
  slotSave.textContent = "Save Slot";
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function timeToMinutes(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(value) {
  const h = Math.floor(value / 60);
  const m = Math.round(value % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatMinutesToLabel(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timelineMarks() {
  const marks = [];
  for (let m = CHART_START; m <= CHART_END; m += 60) marks.push(m);
  if (marks[marks.length - 1] !== CHART_END) marks.push(CHART_END);
  return marks;
}

function clampChartY(y) {
  return Math.max(0, Math.min(CHART_HEIGHT, y));
}

function yToMinutes(y) {
  return CHART_START + clampChartY(y) / PX_PER_MIN;
}

function colorForKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash << 5) - hash + key.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 78%)`;
}

function renderSlots() {
  slotTable.innerHTML = "";
  const memberSlots = data.slots
    .filter((s) => s.memberId === memberId)
    .sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start));

  if (!memberSlots.length) {
    slotTable.innerHTML = `<tr><td colspan="4" class="empty">No slots yet.</td></tr>`;
    return;
  }

  memberSlots.forEach((s) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.project}</td>
      <td>${s.day}</td>
      <td>${s.start} – ${s.end}</td>
      <td>
        <div class="stack">
          <button class="btn btn-ghost" data-action="edit-slot" data-id="${s.id}">Edit</button>
          <button class="btn btn-ghost" data-action="remove-slot" data-id="${s.id}">Remove</button>
        </div>
      </td>
    `;
    slotTable.appendChild(row);
  });
}

function renderTimeline() {
  timeline.innerHTML = "";
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const header = document.createElement("div");
  header.className = "calendar-header";
  header.innerHTML = '<div class="time-head">Time</div>' + days.map((d) => `<div class="day-head">${d}</div>`).join("");
  timeline.appendChild(header);

  const body = document.createElement("div");
  body.className = "calendar-body";

  const axis = document.createElement("div");
  axis.className = "time-axis";
  axis.style.height = CHART_HEIGHT + "px";
  timelineMarks().forEach((minutes) => {
    const mark = document.createElement("div");
    mark.className = "time-mark";
    mark.textContent = formatMinutesToLabel(minutes);
    mark.style.top = `${(minutes - CHART_START) * PX_PER_MIN}px`;
    if (minutes === CHART_START) mark.style.transform = "translateY(0)";
    if (minutes === CHART_END) mark.style.transform = "translateY(-100%)";
    axis.appendChild(mark);
  });
  body.appendChild(axis);

  days.forEach((day) => {
    const col = document.createElement("div");
    col.className = "day-col";
    col.style.height = CHART_HEIGHT + "px";
    const daySlots = data.slots
      .filter((s) => s.memberId === memberId && s.day === day)
      .sort((a, b) => a.start.localeCompare(b.start));

    if (!daySlots.length) {
      const empty = document.createElement("div");
      empty.className = "track-empty";
      empty.textContent = "Free";
      col.appendChild(empty);
    } else {
      daySlots.forEach((s) => {
        let startMin = Math.max(CHART_START, timeToMinutes(s.start));
        let endMin = Math.min(CHART_END, timeToMinutes(s.end));
        if (endMin <= CHART_START || startMin >= CHART_END) return;
        if (endMin <= startMin) return;

        const block = document.createElement("div");
        block.className = "slot-block";
        block.style.top = `${(startMin - CHART_START) * PX_PER_MIN}px`;
        const height = Math.max(18, (endMin - startMin) * PX_PER_MIN);
        block.style.height = `${height}px`;
        block.style.background = colorForKey(s.project + s.day);
        block.title = `${s.project} • ${s.start} – ${s.end}`;
        block.innerHTML = `<strong>${s.project}</strong><span>${s.start} – ${s.end}</span>`;
        col.appendChild(block);
      });
    }

    body.appendChild(col);
    attachDragHandlers(col, day);
  });

  timeline.appendChild(body);
}

function handleSlotSave() {
  if (!member) return;
  const project = slotProject.value.trim();
  const day = slotDay.value;
  const start = slotStart.value;
  const end = slotEnd.value;
  if (!project) return alert("Project is required.");
  if (!start || !end) return alert("Start and end times are required.");
  if (end <= start) return alert("End time must be after start time.");

  if (editingSlotId) {
    const slot = data.slots.find((s) => s.id === editingSlotId);
    if (slot) Object.assign(slot, { project, day, start, end });
  } else {
    data.slots.push({ id: generateId(), memberId, project, day, start, end });
  }
  renderSlots();
  renderTimeline();
  resetSlotForm();
}

function handleSlotClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "edit-slot") {
    const slot = data.slots.find((s) => s.id === id);
    if (!slot) return;
    editingSlotId = id;
    slotProject.value = slot.project;
    slotDay.value = slot.day;
    slotStart.value = slot.start;
    slotEnd.value = slot.end;
    slotState.textContent = "Editing time slot — save to apply changes.";
    slotSave.textContent = "Update Slot";
  } else if (action === "remove-slot") {
    data.slots = data.slots.filter((s) => s.id !== id);
    renderSlots();
    renderTimeline();
    resetSlotForm();
  }
}

function populateDragModal(day, startMin, endMin) {
  modalProject.value = "";
  modalStart.value = minutesToTime(startMin);
  modalEnd.value = minutesToTime(endMin);
  modalSummary.textContent = `${day}: ${modalStart.value} – ${modalEnd.value}`;
}

function showSlotModal(day, startMin, endMin) {
  populateDragModal(day, startMin, endMin);
  modalBackdrop.dataset.day = day;
  modalBackdrop.classList.add("active");
}

function hideSlotModal() {
  modalBackdrop.classList.remove("active");
  delete modalBackdrop.dataset.day;
}

function handleModalSave() {
  if (!modalBackdrop.dataset.day) return hideSlotModal();
  const project = modalProject.value.trim();
  const start = modalStart.value;
  const end = modalEnd.value;
  const day = modalBackdrop.dataset.day;
  if (!project) return alert("Project is required.");
  if (!start || !end) return alert("Start and end times are required.");
  if (end <= start) return alert("End time must be after start time.");
  data.slots.push({ id: generateId(), memberId, project, day, start, end });
  renderSlots();
  renderTimeline();
  hideSlotModal();
}

function attachDragHandlers(col, day) {
  col.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = col.getBoundingClientRect();
    const startY = clampChartY(e.clientY - rect.top);
    const selection = document.createElement("div");
    selection.className = "drag-selection";
    col.appendChild(selection);
    dragState = { col, startY, selection, day };

    const move = (ev) => {
      if (!dragState) return;
      const y = clampChartY(ev.clientY - rect.top);
      const top = Math.min(dragState.startY, y);
      const height = Math.max(6, Math.abs(y - dragState.startY));
      selection.style.top = `${top}px`;
      selection.style.height = `${Math.min(height, CHART_HEIGHT)}px`;
      dragState.lastY = y;
    };

    const up = (ev) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (!dragState) return;
      const endRaw = Number.isFinite(ev.clientY) ? ev.clientY - rect.top : dragState.lastY ?? dragState.startY;
      const endY = clampChartY(endRaw);
      const startYFinal = dragState.startY;
      const top = Math.min(startYFinal, endY);
      const bottom = Math.max(startYFinal, endY);
      const duration = bottom - top;
      selection.remove();
      const selectedMinutes = duration / PX_PER_MIN;
      const startMin = yToMinutes(top);
      const endMin = yToMinutes(bottom);
      dragState = null;
      if (selectedMinutes < MIN_DRAG_MINUTES) return;
      showSlotModal(day, startMin, endMin);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
}

async function init() {
  if (!memberId) {
    memberMeta.textContent = "No member id provided.";
    return;
  }

  await loadInitialData();
  member = data.members.find((m) => m.id === memberId);
  if (!member) {
    memberMeta.textContent = "Member not found.";
    return;
  }

  updateMemberMeta();
  renderSlots();
  renderTimeline();
  resetSlotForm();

  slotSave.addEventListener("click", handleSlotSave);
  slotReset.addEventListener("click", resetSlotForm);
  slotTable.addEventListener("click", handleSlotClick);

  modalSave.addEventListener("click", handleModalSave);
  modalCancel.addEventListener("click", hideSlotModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) hideSlotModal();
  });

  downloadDataBtn.addEventListener("click", downloadData);
  uploadDataBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileChange);
}

document.addEventListener("DOMContentLoaded", init);
