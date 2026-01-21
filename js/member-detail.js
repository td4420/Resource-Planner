const storageKey = "resourcePlannerData";
const params = new URLSearchParams(window.location.search);
const memberId = params.get("id");

const memberTitle = document.getElementById("member-title");
const memberMeta = document.getElementById("member-meta");
const downloadDataBtn = document.getElementById("download-data");
const uploadDataBtn = document.getElementById("upload-data");
const fileInput = document.getElementById("file-input");
const themeToggle = document.getElementById("theme-toggle");

const timeline = document.getElementById("timeline");
const availabilityEl = document.getElementById("availability");
const monthPicker = document.getElementById("month-picker");

const modalBackdrop = document.getElementById("slot-modal");
const modalSummary = document.getElementById("modal-summary");
const modalProject = document.getElementById("modal-project");
const modalStart = document.getElementById("modal-start");
const modalEnd = document.getElementById("modal-end");
const modalSave = document.getElementById("modal-save");
const modalCancel = document.getElementById("modal-cancel");
const toastEl = document.getElementById("toast");
const confirmBackdrop = document.getElementById("confirm");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");

const CHART_START = 9 * 60; // 09:00 in minutes
const CHART_END = 18 * 60 + 15; // 18:15 in minutes
const CHART_RANGE = CHART_END - CHART_START;
const PX_PER_MIN = 1;
const CHART_HEIGHT = CHART_RANGE * PX_PER_MIN;
const MIN_DRAG_MINUTES = 5;

let data = { members: [], slots: [], projects: [] };
let member = null;
let editingSlotId = null;
let dragState = null;
let dragDayForModal = null;
let modalRange = null; // restricts start/end when launching from availability
let confirmResolver = null;
let selectedMonth = null;
let themeMode = "light";

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) data = JSON.parse(raw);
  } catch (e) {
    console.warn("Could not read localStorage, starting empty.", e);
  }
  data.members = data.members || [];
  data.slots = (data.slots || []).map((s) => ({ ...s, month: s.month || currentMonth() }));
  data.projects = data.projects || [];
  data.members.forEach((m) => {
    if (!m.level) m.level = "Unspecified";
  });
}

function saveToStorage() {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function applyTheme(mode) {
  document.body.classList.toggle("dark", mode === "dark");
  localStorage.setItem("theme", mode);
  themeMode = mode;
  if (themeToggle) {
    themeToggle.textContent = mode === "dark" ? "☀️" : "🌙";
    themeToggle.setAttribute("aria-label", mode === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }
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
      saveToStorage();
      member = data.members.find((m) => m.id === memberId);
      if (!member) {
        memberMeta.textContent = "Member not found in uploaded data.";
        timeline.innerHTML = "";
        showToast("Member not found in uploaded data.", true);
      } else {
        updateMemberMeta();
        renderTimeline();
        renderAvailability();
        showToast("Data loaded.");
      }
    } catch (err) {
      showToast("Invalid JSON file.", true);
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function updateMemberMeta() {
  memberTitle.textContent = member ? `Member: ${member.name}` : "Member Detail";
  memberMeta.textContent = member
    ? `${member.name} — ${member.role || "No role provided"} — ${member.level || "Unspecified"}`
    : "Member not found.";
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

function hasOverlap(day, start, end, ignoreId = null) {
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  return data.slots
    .filter((s) => s.memberId === memberId && s.day === day && s.id !== ignoreId && s.month === selectedMonth)
    .some((s) => {
      const sStart = timeToMinutes(s.start);
      const sEnd = timeToMinutes(s.end);
      return Math.max(startMin, sStart) < Math.min(endMin, sEnd);
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
      .filter((s) => s.memberId === memberId && s.day === day && s.month === selectedMonth)
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
        block.innerHTML = `
          <strong>${s.project}</strong>
          <span>${s.start} – ${s.end}</span>
          <div class="slot-actions">
            <button class="slot-btn" data-action="remove-slot" data-id="${s.id}">Delete</button>
          </div>
        `;
        block.dataset.slotId = s.id;
        col.appendChild(block);
      });
    }

    body.appendChild(col);
    attachDragHandlers(col, day);
  });

  timeline.appendChild(body);
}

function renderAvailability() {
  if (!availabilityEl) return;
  availabilityEl.innerHTML = "";
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  days.forEach((day) => {
    const daySlots = data.slots
      .filter((s) => s.memberId === memberId && s.day === day && s.month === selectedMonth)
      .sort((a, b) => a.start.localeCompare(b.start));
    const gaps = [];
    let cursor = CHART_START;
    if (!daySlots.length) {
      gaps.push([CHART_START, CHART_END]);
    } else {
      daySlots.forEach((s) => {
        const sStart = Math.max(CHART_START, timeToMinutes(s.start));
        const sEnd = Math.min(CHART_END, timeToMinutes(s.end));
        if (sStart > cursor) gaps.push([cursor, sStart]);
        cursor = Math.max(cursor, sEnd);
      });
      if (cursor < CHART_END) gaps.push([cursor, CHART_END]);
    }

    const row = document.createElement("div");
    row.className = "item";
    const label = document.createElement("div");
    label.innerHTML = `<h3>${day}</h3>`;
    row.appendChild(label);
    const content = document.createElement("div");
    if (!gaps.length || gaps.every(([a, b]) => b - a <= 0)) {
      content.innerHTML = '<span class="empty">Fully booked</span>';
    } else {
      content.innerHTML = gaps
        .filter(([a, b]) => b - a > 0)
        .map(
          ([a, b]) =>
            `<span class="slot-chip" data-available-day="${day}" data-start="${minutesToTime(a)}" data-end="${minutesToTime(b)}"><span class="chip-time">${minutesToTime(a)} – ${minutesToTime(b)}</span></span>`
        )
        .join(" ");
    }
    row.appendChild(content);
    availabilityEl.appendChild(row);
  });
}

function handleSlotClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "edit-slot") {
    const slot = data.slots.find((s) => s.id === id);
    if (!slot) return;
    editingSlotId = id;
    dragDayForModal = slot.day;
    modalRange = null;
    populateModal(slot.day, timeToMinutes(slot.start), timeToMinutes(slot.end), slot.project);
    modalBackdrop.classList.add("active");
  } else if (action === "remove-slot") {
    confirmDialog("Delete this slot?").then((ok) => {
      if (!ok) return;
      data.slots = data.slots.filter((s) => s.id !== id);
      saveToStorage();
      renderTimeline();
      renderAvailability();
      showToast("Slot deleted.");
      hideSlotModal();
    });
  }
}

function populateModal(day, startMin, endMin, projectValue = "") {
  modalStart.value = minutesToTime(startMin);
  modalEnd.value = minutesToTime(endMin);
  modalSummary.textContent = `${day}: ${modalStart.value} – ${modalEnd.value}`;
  modalProject.value = projectValue;
}

function showSlotModal(day, startMin, endMin) {
  editingSlotId = null;
  dragDayForModal = day;
  modalRange = null;
  populateModal(day, startMin, endMin);
  modalBackdrop.classList.add("active");
}

function hideSlotModal() {
  modalBackdrop.classList.remove("active");
  dragDayForModal = null;
  editingSlotId = null;
  modalRange = null;
}

function handleModalSave() {
  if (!dragDayForModal) return hideSlotModal();
  const project = modalProject.value.trim();
  const start = modalStart.value;
  const end = modalEnd.value;
  const day = dragDayForModal;
  if (!project) return showToast("Project is required.", true);
  if (!start || !end) return showToast("Start and end times are required.", true);
  if (end <= start) return showToast("End time must be after start time.", true);
  if (hasOverlap(day, start, end, editingSlotId)) {
    return showToast("This time overlaps an existing slot.", true);
  }
  if (modalRange) {
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (startMin < modalRange.start || endMin > modalRange.end) {
      return showToast("Pick a time inside the suggested free slot.", true);
    }
  }
  if (editingSlotId) {
    const slot = data.slots.find((s) => s.id === editingSlotId);
    if (slot) Object.assign(slot, { project, day, start, end, month: selectedMonth });
  } else {
    data.slots.push({ id: generateId(), memberId, project, day, start, end, month: selectedMonth });
  }
  saveToStorage();
  renderTimeline();
  renderAvailability();
  hideSlotModal();
  showToast(editingSlotId ? "Slot updated." : "Slot added.");
}

function showToast(message, isError = false) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.toggle("error", isError);
  toastEl.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2200);
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

  loadFromStorage();
  selectedMonth = currentMonth();
  if (monthPicker) monthPicker.value = selectedMonth;
  member = data.members.find((m) => m.id === memberId);
  if (!member) {
    memberMeta.textContent = "Member not found.";
    return;
  }

  updateMemberMeta();
  renderTimeline();
  renderAvailability();

  timeline.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='remove-slot']");
    if (btn) {
        const { id } = btn.dataset;
        confirmDialog("Delete this slot?").then((ok) => {
          if (!ok) return;
          data.slots = data.slots.filter((s) => s.id !== id);
          saveToStorage();
          renderTimeline();
          renderAvailability();
          showToast("Slot deleted.");
        });
      }
  });
  availabilityEl.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-available-day]");
    if (!chip) return;
    const day = chip.dataset.availableDay;
    const start = chip.dataset.start;
    const end = chip.dataset.end;
    editingSlotId = null;
    dragDayForModal = day;
    modalRange = { start: timeToMinutes(start), end: timeToMinutes(end) };
    populateModal(day, modalRange.start, modalRange.end);
    modalBackdrop.classList.add("active");
  });

  modalSave.addEventListener("click", handleModalSave);
  modalCancel.addEventListener("click", hideSlotModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) hideSlotModal();
  });

  if (monthPicker) {
    monthPicker.addEventListener("change", () => {
      selectedMonth = monthPicker.value || currentMonth();
      renderTimeline();
      renderAvailability();
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

  const storedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(storedTheme || (prefersDark ? "dark" : "light"));
  if (themeToggle) {
    themeToggle.addEventListener("change", () => applyTheme(themeToggle.checked ? "dark" : "light"));
  }

  downloadDataBtn.addEventListener("click", downloadData);
  uploadDataBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileChange);
}

document.addEventListener("DOMContentLoaded", init);
