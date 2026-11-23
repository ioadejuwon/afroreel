const sidebar = document.querySelector("#admin-sidebar");
const sidebarOverlay = document.querySelector("[data-sidebar-overlay]");
const sidebarToggles = Array.from(document.querySelectorAll("[data-sidebar-toggle]"));
const basePath = window.AFROREEL_BASE_PATH || "";

function setSidebarOpen(isOpen) {
  sidebar?.classList.toggle("open", isOpen);
  sidebarOverlay?.classList.toggle("visible", isOpen);
  document.body.classList.toggle("sidebar-open", isOpen);
  sidebarToggles.forEach((toggle) => {
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

sidebarToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    setSidebarOpen(!sidebar?.classList.contains("open"));
  });
});

sidebarOverlay?.addEventListener("click", () => {
  setSidebarOpen(false);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sidebar?.classList.contains("open")) {
    setSidebarOpen(false);
    sidebarToggles[0]?.focus();
  }
});

window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 1080px)").matches) {
    setSidebarOpen(false);
  }
});

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";

document.querySelectorAll("[data-team-form]").forEach(form => {
  function showPermissions() {
    form.querySelectorAll("[data-permissions]").forEach(panel => {
      panel.hidden = panel.dataset.permissions !== form.elements.role.value;
    });
  }
  form.addEventListener("change", showPermissions);
  showPermissions();
});

const teamDrawer = document.querySelector(".team-drawer");
document.querySelectorAll("[data-team-edit]").forEach(button => {
  button.addEventListener("click", () => {
    const { path, name, email, role, kind } = button.dataset;
    const form = teamDrawer.querySelector("form");
    form.action = path + "/access";
    form.elements.role.value = role;
    form.dispatchEvent(new Event("change"));
    const remove = form.querySelector("[data-remove]");
    remove.hidden = kind === "member" && role === "owner";
    const reset = form.querySelector("[data-reset]");
    reset.hidden = kind !== "member";
    reset.formAction = path + "/reset";
    form.dataset.recipient = email;
    remove.formAction = path + "/remove";
    remove.textContent = kind === "invite" ? "Revoke invitation" : "Remove from team";
    form.querySelector("[data-team-person]").textContent = name + " · " + email;
    teamDrawer.showModal();
  });
});
teamDrawer?.querySelectorAll("[data-dismiss]").forEach(button => button.addEventListener("click", () => teamDrawer.close()));
teamDrawer?.querySelector("[data-remove]").addEventListener("click", event => {
  const member = teamDrawer.querySelector("[data-team-person]").textContent;
  if (!window.confirm(event.currentTarget.textContent + " — " + member + "?")) event.preventDefault();
});

document.querySelectorAll("[data-team-emails]").forEach(input => {
  const form = input.form;
  const values = new Set();
  const box = document.createElement("div");
  box.className = "tags-input";
  input.removeAttribute("name");
  input.setAttribute("aria-label", "Email addresses");
  input.parentElement.after(box);
  box.append(input);
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = "emails";
  form.append(hidden);
  function sync() {
    hidden.value = [...values].join(", ");
    input.required = !values.size;
  }
  function commit() {
    for (const email of input.value.toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
      if (values.has(email)) continue;
      values.add(email);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = email + " ×";
      chip.setAttribute("aria-label", "Remove " + email);
      chip.onclick = () => { values.delete(email); chip.remove(); sync(); input.focus(); };
      box.insertBefore(chip,input);
    }
    input.value = "";
    sync();
  }
  input.addEventListener("keydown", event => {
    if (!event.isComposing && ["Enter",","].includes(event.key)) { event.preventDefault(); commit(); }
  });
  form.addEventListener("submit", event => {
    commit();
    if (!values.size) { event.preventDefault(); input.reportValidity(); }
  });
});

document.querySelectorAll("[data-team-form]").forEach(form => {
  form.addEventListener("submit", event => {
    if (event.defaultPrevented || event.submitter?.matches("[data-remove],[data-reset]") || form.elements.role.value !== "owner") return;
    const recipients = form.elements.emails?.value || form.dataset.recipient;
    if (!window.confirm("Grant Owner access to " + recipients + "? They can grant ownership and demote other Owners.")) event.preventDefault();
  });
});

const library = document.querySelector("#series");
const libraryCards = Array.from(document.querySelectorAll("[data-series-status]"));
const searchInput = document.querySelector('.search input[type="search"]');
const libraryFilter = library?.dataset.filterStatus || "all";

function refreshLibrary() {
  if (!library) return;
  const counts = { all: libraryCards.length, draft: 0, live: 0 };
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  for (const card of libraryCards) {
    const status = card.dataset.seriesStatus;
    counts[status]++;
    card.hidden = (libraryFilter !== "all" && libraryFilter !== status) || !card.dataset.searchText.includes(query);
    if (!card.hidden) visible++;
  }
  library.querySelectorAll("[data-count]").forEach(label => { label.textContent = counts[label.dataset.count]; });
  library.querySelectorAll("[data-filter]").forEach(link => {
    const url = new URL(link.href);
    if (query) url.searchParams.set("q", searchInput.value.trim());
    else url.searchParams.delete("q");
    link.href = url.href;
  });
  const empty = library.querySelector("[data-library-empty]");
  empty.hidden = visible > 0;
  empty.textContent = counts.all ? "No series match this filter or search." : "No series yet.";
}

if (library) {
  refreshLibrary();
  searchInput?.addEventListener("input", () => {
    const url = new URL(window.location.href);
    if (searchInput.value.trim()) url.searchParams.set("q", searchInput.value.trim());
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
    refreshLibrary();
  });
}

document.querySelectorAll(".series-cover img").forEach(img => {
  const showFallback = () => { img.hidden = true; };
  img.addEventListener("error", showFallback, { once: true });
  if (img.complete && !img.naturalWidth) showFallback();
});

const notifications = document.querySelector(".notifications");
let notificationRequest = 0;
async function refreshNotifications() {
  if (!notifications) return;
  const request = ++notificationRequest;
  try {
    const response = await fetch(notifications.dataset.notificationsUrl, {
      headers: { accept: "text/html" }, cache: "no-store",
    });
    if (!response.ok || response.redirected) return;
    const html = await response.text();
    if (request !== notificationRequest) return;
    const list = notifications.querySelector("[data-notification-list]");
    if (list.contains(document.activeElement)) return;
    list.innerHTML = html;
    notifications.querySelector(".notification-dot").hidden = !list.querySelector("li");
  } catch {
    // The server-rendered list stays available if the connection drops.
  }
}
notifications?.addEventListener("toggle", () => {
  if (notifications.open) refreshNotifications();
});
notifications?.addEventListener("keydown", event => {
  if (event.key === "Escape" && notifications.open) {
    notifications.open = false;
    notifications.querySelector("summary").focus();
  }
});
window.addEventListener("click", event => {
  if (notifications?.open && (!notifications.contains(event.target) || event.target.closest("a"))) {
    notifications.open = false;
  }
});

const cardMenus = Array.from(document.querySelectorAll(".card-menu"));
cardMenus.forEach(menu => {
  menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    const panelHeight = menu.querySelector(".card-menu-items").offsetHeight;
    const rect = menu.getBoundingClientRect();
    menu.classList.toggle("opens-up", window.innerHeight - rect.bottom < panelHeight && rect.top >= panelHeight);
  });
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });
  menu.addEventListener("focusout", event => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  });
});
window.addEventListener("click", event => {
  for (const menu of cardMenus) {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  }
});

const deleteDialog = document.querySelector(".delete-dialog");
let deleteTrigger;
let draftForm;
document.querySelectorAll("[data-delete-series]").forEach(button => {
  button.addEventListener("click", () => {
    const {title, episodes, deleteSeries} = button.dataset;
    const menu = button.closest("details");
    deleteTrigger = menu?.querySelector("summary") || button;
    if (menu) menu.open = false;
    draftForm = (button.closest(".series-card") || document.querySelector(".show-hero"))?.querySelector("[data-status-form]");
    const form = deleteDialog.querySelector("form");
    form.reset();
    form.action = deleteSeries;
    form.elements.expectedEpisodes.value = episodes;
    form.elements.confirmationTitle.placeholder = title;
    form.querySelector('[type="submit"]').disabled = true;
    form.querySelector("[data-draft-alternative]").hidden = draftForm?.elements.status.value !== "draft";
    form.querySelector("h2").textContent = `Delete “${title}”?`;
    form.querySelector("#delete-impact").textContent = `This permanently removes the series and its ${episodes} episode${episodes === "1" ? "" : "s"}, including linked viewing activity. Unused videos and posters will be deleted. This can’t be undone.`;
    deleteDialog.showModal();
  });
});
deleteDialog?.addEventListener("input", () => {
  const input = deleteDialog.querySelector("[name=confirmationTitle]");
  deleteDialog.querySelector('[type="submit"]').disabled = input.value !== input.placeholder;
});
deleteDialog?.querySelector(".text-action").addEventListener("click", () => {
  deleteDialog.close();
  draftForm?.requestSubmit();
});
deleteDialog?.querySelector("[data-cancel-delete]").addEventListener("click", () => deleteDialog.close());
deleteDialog?.addEventListener("close", () => deleteTrigger?.focus());

document.querySelectorAll("[data-tags]").forEach(field => {
  const tags = [...new Set(field.value.split(",").map(tag => tag.trim()).filter(Boolean))];
  const entry = document.createElement("input");
  entry.placeholder = "Add a tag";
  entry.setAttribute("aria-label", "Add a tag");
  const group = document.createElement("div");
  group.className = "tags-input";
  field.type = "hidden";
  field.closest("label").after(group);
  group.append(entry);
  function render() {
    group.querySelectorAll("button").forEach(button => button.remove());
    tags.forEach((tag, index) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = tag + " ×";
      chip.setAttribute("aria-label", "Remove " + tag);
      chip.onclick = () => { tags.splice(index, 1); render(); entry.focus(); };
      group.insertBefore(chip, entry);
    });
    field.value = tags.join(", ");
  }
  function commit() {
    const values = [...new Set([...tags, ...entry.value.split(",").map(tag => tag.trim()).filter(Boolean)])];
    if ([...values.join(", ")].length > 255) {
      entry.setCustomValidity("Use 255 characters or fewer for all tags.");
      entry.reportValidity();
      return;
    }
    tags.splice(0, tags.length, ...values);
    entry.value = "";
    render();
  }
  entry.addEventListener("keydown", event => {
    if (!event.isComposing && ["Enter", ","].includes(event.key)) { event.preventDefault(); commit(); }
  });
  entry.addEventListener("input", () => entry.setCustomValidity(""));
  entry.addEventListener("blur", commit);
  field.form.addEventListener("submit", event => {
    commit();
    if (!entry.validity.valid) { event.preventDefault(); event.stopImmediatePropagation(); }
  });
  render();
});

document.querySelectorAll("[data-poster-form]").forEach((form) => {
  const fileInput = form.querySelector("[data-poster-file]");
  const fileName = form.querySelector("[data-poster-file-name]");
  const dropzone = form.querySelector("[data-poster-dropzone]");
  const preview = form.querySelector("[data-poster-preview]");
  const status = form.querySelector("[data-poster-status]");
  const button = form.querySelector('button[type="submit"]');
  form.querySelector("[data-replace-poster]")?.addEventListener("click", () => fileInput.click());
  let posterPreviewUrl = "";
  let uploadedImageId = "";

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    uploadedImageId = "";
    setStatus(status, "");
    if (fileName) {
      fileName.textContent = file ? file.name : "Drop image here or choose file";
    }
    if (preview) {
      if (posterPreviewUrl) {
        URL.revokeObjectURL(posterPreviewUrl);
      }
      posterPreviewUrl = file ? URL.createObjectURL(file) : "";
      preview.style.backgroundImage = posterPreviewUrl ? `url("${posterPreviewUrl}")` : "";
      preview.classList.toggle("visible", Boolean(file));
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, () => dropzone.classList.add("is-dragging"));
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, () => dropzone.classList.remove("is-dragging"));
  });

  form.addEventListener("submit", async (event) => {
    const file = fileInput?.files?.[0];
    if (!button) return;
    const payload = Object.fromEntries(new FormData(form, event.submitter));
    event.preventDefault();
    if (button.disabled) return;

    if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus(status, "Choose a JPEG, PNG, or WebP poster.");
      return;
    }
    if (file && (!file.size || file.size > 10 * 1000 * 1000)) {
      setStatus(status, "Choose a poster that is 10 MB or smaller.");
      return;
    }

    const actions = form.querySelectorAll('[type="submit"]');
    actions.forEach(action => { action.disabled = true; });
    fileInput.disabled = true;
    try {
      if (file && !uploadedImageId) {
        setStatus(status, "Uploading poster to Cloudflare…");
        const upload = await postJson(appUrl("/admin/api/cloudflare/image-upload-url"), {});
        const imageBody = new FormData();
        imageBody.set("file", file);
        const response = await fetch(upload.uploadUrl, {
          method: "POST",
          body: imageBody,
          signal: AbortSignal.timeout(60_000),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.success === false) throw new Error("Cloudflare could not upload the poster.");
        uploadedImageId = upload.id;
      }
      setStatus(status, file ? "Verifying poster…" : "Saving series…");
      const saved = await postJson(form.action, {
        ...payload,
        posterImageId: uploadedImageId,
      });
      window.location.assign(saved.redirectTo);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Poster upload failed.");
    } finally {
      actions.forEach(action => { action.disabled = false; });
      fileInput.disabled = false;
    }
  });
});

document.querySelectorAll("[data-upload-video]").forEach((button) => {
  const item = button.closest("[data-episode-id]");
  const input = item?.querySelector("[data-video-file]");
  const fileName = item?.querySelector("[data-video-file-name]");
  const dropzone = item?.querySelector("[data-video-dropzone]");

  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (fileName) {
      fileName.textContent = file ? file.name : "Drop video here or choose file";
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, () => dropzone.classList.add("is-dragging"));
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, () => dropzone.classList.remove("is-dragging"));
  });

  if (button.hasAttribute("data-pick-video")) {
    button.addEventListener("click", () => { input.value = ""; input.click(); });
    input.addEventListener("change", () => { if (input.files.length) upload(); });
  } else button.addEventListener("click", upload);
  async function upload() {
    const status = item?.querySelector("[data-upload-status]");
    const refreshButton = item?.querySelector("[data-refresh-video]");
    const file = input?.files?.[0];
    const episodeId = item?.dataset.episodeId;

    if (!item || !file || !episodeId) {
      alert("Choose a video file first.");
      return;
    }

    button.disabled = true;
    input.disabled = true;
    if (refreshButton) refreshButton.disabled = true;
    setStatus(status, "Preparing video upload…");

    try {
      const video = await uploadCloudflareVideoWithProgress(
        episodeId,
        file,
        item.dataset.videoUid,
        (upload) => {
          item.dataset.videoUid = upload.uid;
          setStatus(item.querySelector("[data-video-state]"), "Uploading");
        },
        (progress) => setStatus(status, `Uploading video… ${progress}%`),
      );
      updateVideoCard(item, video);
      const finalStatus = await pollStreamStatus(episodeId, video);
      updateVideoCard(item, finalStatus);
      reconcileUploadQueue(item, finalStatus);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Upload failed.");
      if (refreshButton && item.dataset.videoUid) refreshButton.disabled = false;
    } finally {
      button.disabled = false;
      input.disabled = false;
    }
  }
});

document.querySelectorAll("[data-episode-create-form]").forEach((form) => {
  const input = form.querySelector("[data-create-video-file]");
  const fileName = form.querySelector("[data-create-video-file-name]");
  const dropzone = form.querySelector("[data-video-create-dropzone]");
  const status = form.querySelector("[data-create-episode-status]");
  let draftEpisode;
  const number = form.elements.episodeNumber;
  const access = form.elements.access;
  function updateAccess() {
    const series = form.elements.seriesId;
    const inherited = form.dataset.seriesAccess || series.selectedOptions?.[0]?.dataset.access;
    if (access.options) access.options[0].textContent = inherited ? "Series default · " + (inherited === "free" ? "Free" : "Locked") : "Choose a series";
    const preview = document.querySelector("[data-number-preview]");
    if (preview) preview.textContent = number.value;
    form.elements.coinCost.disabled = access.value === "free" || (access.value === "default" && inherited === "free");
  }
  form.addEventListener("change", updateAccess);
  number.addEventListener("input", updateAccess);
  updateAccess();


  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (fileName) {
      fileName.textContent = file ? file.name : "Drop video here or choose file";
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, () => dropzone.classList.add("is-dragging"));
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, () => dropzone.classList.remove("is-dragging"));
  });

  form.addEventListener("submit", async (event) => {
    const file = input?.files?.[0];

    event.preventDefault();
    const data = Object.fromEntries(new FormData(form, event.submitter));
    if (file && data.intent === "add") data.intent = "publish-when-ready";
    const actions = form.querySelectorAll('[type="submit"]');
    actions.forEach(action => { action.disabled = true; });
    setStatus(status, draftEpisode ? "Preparing video upload…" : "Creating episode…");

    try {
      if (!draftEpisode) {
        draftEpisode = await postJson(form.action, data);
      }
      if (!file) {
        window.location.assign(draftEpisode.redirectTo);
        return;
      }
      const video = await uploadCloudflareVideoWithProgress(
        draftEpisode.episodeId,
        file,
        undefined,
        () => setStatus(status, "Uploading video…"),
        (progress) => setStatus(status, `Uploading video… ${progress}%`),
      );
      setStatus(status, video.label);
      await pollStreamStatus(draftEpisode.episodeId, video);
      window.location.assign(draftEpisode.redirectTo || appUrl("/admin/episodes"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Episode creation failed.";
      setStatus(status, draftEpisode ? `Episode saved. ${message}` : message);
      if (draftEpisode) {
        const link = document.createElement("a");
        link.href = draftEpisode.redirectTo;
        link.textContent = "Manage episode and retry upload";
        status.append(" ", link);
      } else actions.forEach(action => { action.disabled = false; });
    }
  });
});

document.querySelectorAll("[data-episode-edit-form]").forEach((form) => {
  const number = form.elements.episodeNumber;
  function updateAccess() {
    const access = form.elements.access.value;
    const inherited = form.dataset.seriesAccess;
    form.elements.coinCost.disabled = access === "free" || (access === "default" && inherited === "free");
    const preview = document.querySelector("[data-number-preview]");
    if (preview) preview.textContent = number.value;
  }
  form.addEventListener("change", updateAccess);
  number.addEventListener("input", updateAccess);
  updateAccess();
});

document.querySelectorAll("[data-refresh-video]").forEach((button) => {
  button.addEventListener("click", async () => {
    const item = button.closest("[data-episode-id]");
    const episodeId = item?.dataset.episodeId;
    const status = item?.querySelector("[data-upload-status]");

    if (!episodeId) {
      return;
    }

    button.disabled = true;
    setStatus(status, "Checking Cloudflare…");

    try {
      const video = await postJson(appUrl(`/admin/api/episodes/${episodeId}/refresh-video`), {});
      updateVideoCard(item, video);
      reconcileUploadQueue(item, video);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Refresh failed.");
      button.disabled = false;
    }
  });
});

document.querySelectorAll("[data-status-form]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector("[data-status-button]");
    const statusInput = form.querySelector('input[name="status"]');
    const entityType = form.dataset.entityType;
    const nextStatus = statusInput?.value || "";

    if (!nextStatus || !statusInput) {
      form.submit();
      return;
    }

    button.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(new FormData(form)),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || response.statusText);
      }

      const status = payload.status || nextStatus;
      if (entityType === "series") {
        document.querySelectorAll('[data-entity-type="series"]').forEach(other => {
          if (other.action === form.action) updateStatusForm(other, status, entityType);
        });
        const current = document.querySelector(`.fields-pane input[name="status"][value="${status}"]`);
        if (current) current.checked = true;
        refreshLibrary();
        if (form.closest("[hidden]")) library?.querySelector('[data-filter][aria-current="page"]')?.focus();
        setStatus(library?.querySelector("[data-library-feedback]"), status === "live" ? "Series published." : "Series moved to draft.");
      } else {
        updateStatusForm(form, status, entityType);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Status update failed.");
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll("[data-delete-episode-form]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!window.confirm("Permanently delete this episode? Its unused video and preview will be deleted from Cloudflare.")) {
      return;
    }

    const button = form.querySelector("button");
    button.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(new FormData(form)),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || response.statusText);
      }

      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Episode removal failed.");
    } finally {
      button.disabled = false;
    }
  });
});

function updateStatusForm(form, status, entityType) {
  const statusInput = form.querySelector('input[name="status"]');
  const statusButton = form.querySelector("[data-status-button]");
  const article = form.closest("article");
  const nextStatus = status === "draft" ? "live" : "draft";

  if (statusInput) {
    statusInput.value = nextStatus;
  }

  if (article?.hasAttribute("data-series-status")) article.dataset.seriesStatus = status;
  article?.querySelectorAll("[data-status-label]").forEach(statusLabel => {
    statusLabel.textContent = entityType === "series" ? (status === "live" ? (article.classList.contains("show-hero") ? "Live" : "Published") : "Draft") : status;
    statusLabel.classList.remove("live", "draft", "review", "blocked");
    statusLabel.classList.add(status === "processing" ? "review" : status);
  });

  if (statusButton) {
    const label = statusButton.querySelector("span") || statusButton;
    label.textContent = nextStatus === "draft" ? (entityType === "series" ? "Move to draft" : "Draft") : "Publish";
    statusButton.querySelector("use")?.setAttribute("href", status === "live" ? "#i-draft" : "#i-publish");
  }
}

function updateVideoCard(item, video) {
  item.dataset.videoUid = video.uid || "";
  setStatus(item.querySelector("[data-video-state]"), video.label);
  setStatus(item.querySelector("[data-upload-status]"), video.error || "");
  const refreshButton = item.querySelector("[data-refresh-video]");
  if (refreshButton) refreshButton.disabled = !video.canRefresh;
  const uploadButton = item.querySelector("[data-upload-video]");
  if (uploadButton) uploadButton.textContent = video.activeReady ? "Replace video" : "Upload video";
  item.querySelector("[data-video-state]").dataset.state = video.state;
  const publishForm = item.querySelector("[data-status-form]");
  if (publishForm) updateStatusForm(publishForm, video.status, "episode");
}

function reconcileUploadQueue(item, video) {
  refreshNotifications();
  const queue = item.closest("[data-upload-queue]");
  if (!queue || !["ready", "processing"].includes(video.state)) return;
  const episode = item.querySelector(".episode-main strong").textContent;
  const moveFocus = item.contains(document.activeElement) || document.activeElement === document.body;
  item.remove();
  const remaining = queue.querySelectorAll("[data-episode-id]").length;
  queue.closest(".view").querySelector("[data-episode-summary]").textContent =
    `${remaining} episode${remaining === 1 ? "" : "s"} with an upload issue.`;
  queue.querySelector(".queue-feedback").textContent =
    `${episode}: ${video.label}.${remaining ? "" : " All caught up."}`;
  if (moveFocus) (queue.querySelector("[data-video-file]") || queue).focus();
}

async function pollStreamStatus(episodeId, video) {
  if (!window.AFROREEL_POLL_STREAM || video.state !== "processing") return video;

  for (const delay of [1500, 3000, 5000, 7500, 10000]) {
    await pause(delay);
    try {
      video = await postJson(appUrl(`/admin/api/episodes/${episodeId}/refresh-video`), {});
    } catch {
      break;
    }
    if (video.state !== "processing") break;
  }
  return video;
}

const streamUploads = new Map();
const tusChunkSize = 50 * 1024 * 1024;

function rememberStreamUpload(key, upload) {
  if (upload) streamUploads.set(key, upload);
  else streamUploads.delete(key);
  try {
    if (upload) window.sessionStorage.setItem(key, JSON.stringify(upload));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Uploads can still resume in this page when browser storage is unavailable.
  }
}

function readStreamUpload(key) {
  if (streamUploads.has(key)) return streamUploads.get(key);
  try {
    return JSON.parse(window.sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

async function uploadCloudflareVideoWithProgress(episodeId, file, currentUid, onReserved, onProgress) {
  const path = appUrl(`/admin/api/episodes/${episodeId}`);
  const key = `afroreel-stream:${path}`;
  const fileKey = JSON.stringify([file.name, file.size, file.lastModified]);
  let upload = readStreamUpload(key);
  const resume = upload && upload.fileKey === fileKey && upload.expiresAt > Date.now() &&
    (currentUid === undefined || upload.uid === currentUid);
  if (!resume) {
    const reserved = await postJson(`${path}/tus-upload-url`, { uploadLength: file.size, name: file.name });
    upload = { ...reserved, fileKey, finished: false };
    rememberStreamUpload(key, upload);
  }
  onReserved(upload);

  try {
    if (!upload.finished) {
      const offset = resume ? await readTusOffset(upload.uploadUrl, file.size) : 0;
      await sendTusChunks(file, upload.uploadUrl, offset, onProgress);
      upload.finished = true;
      rememberStreamUpload(key, upload);
    }
  } catch (error) {
    if (error.status === 404 || error.status === 410) {
      // The provider can close an upload URL after accepting the last chunk.
      const video = await postJson(`${path}/refresh-video`, {}).catch(() => null);
      if (video?.uid === upload.uid && ["processing", "ready", "failed"].includes(video.state)) {
        rememberStreamUpload(key, null);
        return video;
      }
      rememberStreamUpload(key, null);
      throw new Error("The upload link expired. Upload the file again to get a new link.");
    }
    throw new Error("Video upload interrupted. Retry with the same file to resume.");
  }

  try {
    const video = await postJson(`${path}/cloudflare-complete`, { uid: upload.uid });
    rememberStreamUpload(key, null);
    return video;
  } catch (error) {
    if (error.status === 409) rememberStreamUpload(key, null);
    throw error;
  }
}

async function readTusOffset(uploadUrl, fileSize) {
  const response = await fetch(uploadUrl, {
    method: "HEAD",
    headers: { "Tus-Resumable": "1.0.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return confirmedTusOffset(response, fileSize);
}

function confirmedTusOffset(response, fileSize) {
  if (!response.ok) {
    throw Object.assign(new Error("Cloudflare rejected the upload request."), { status: response.status });
  }
  const value = response.headers.get("Upload-Offset");
  const offset = value && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > fileSize) {
    throw new Error("Cloudflare did not confirm the upload offset.");
  }
  return offset;
}

async function sendTusChunks(file, uploadUrl, offset, onProgress) {
  let retries = 0;
  onProgress(Math.floor(offset / file.size * 100));
  while (offset < file.size) {
    const end = Math.min(file.size, offset + tusChunkSize);
    try {
      const response = await fetch(uploadUrl, {
        method: "PATCH",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: file.slice(offset, end),
        signal: AbortSignal.timeout(180_000),
      });
      const confirmed = confirmedTusOffset(response, file.size);
      if (confirmed <= offset) throw new Error("The upload has not advanced.");
      offset = confirmed;
      retries = 0;
    } catch (error) {
      const retryable = !error.status || [408, 409, 429].includes(error.status) || error.status >= 500;
      if (!retryable || retries >= 3) throw error;
      await pause(750 * 2 ** retries++);
      offset = await readTusOffset(uploadUrl, file.size);
    }
    onProgress(Math.floor(offset / file.size * 100));
  }
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appUrl(path) {
  return `${basePath}${path}`;
}

function focusTarget(targetId) {
  const target = targetId ? document.getElementById(targetId) : null;

  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("is-highlighted");
  window.setTimeout(() => target.classList.remove("is-highlighted"), 1100);

  const firstField = target.querySelector('input:not([type="hidden"]), select, textarea, button');
  firstField?.focus({ preventScroll: true });
}

function focusEpisodeAnchor() {
  const id = window.location.hash.slice(1);
  const target = id && document.getElementById(id);
  if (!target || !target.closest(".view.active")) return;
  if (id === "episode-form") {
    focusTarget(id);
  } else if (id.startsWith("upload-") || id.startsWith("episode-") || id === "video-uploads") {
    const card = target.closest(".episode-upload-card");
    (card || target).scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  }
}
window.addEventListener("hashchange", focusEpisodeAnchor);
window.addEventListener("pageshow", event => {
  if (event.persisted) window.location.reload();
  else if (!event.persisted && window.location.hash) focusEpisodeAnchor();
});

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "csrf-token": csrfToken,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
    throw Object.assign(new Error(message || response.statusText || "Request failed."), { status: response.status });
  }
  if (!payload) throw new Error("The admin did not return a response. Refresh the page and sign in again if needed.");

  return payload;
}

function setStatus(element, value) {
  if (element) {
    element.textContent = value;
  }
}
