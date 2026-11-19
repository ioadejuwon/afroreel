const navItems = Array.from(document.querySelectorAll(".nav-item"));
const views = Array.from(document.querySelectorAll(".view"));
const viewTitle = document.querySelector("#view-title");
const sidebar = document.querySelector("#admin-sidebar");
const sidebarOverlay = document.querySelector("[data-sidebar-overlay]");
const sidebarToggles = Array.from(document.querySelectorAll("[data-sidebar-toggle]"));
const basePath = window.AFROREEL_BASE_PATH || "";
const serverInitialView = window.AFROREEL_INITIAL_VIEW || "";
const adminBasePath = `${basePath}/admin`;

const titles = {
  dashboard: "Dashboard",
  series: "Series",
  "series-new": "Create Series",
  "series-detail": "Series",
  episodes: "Episodes",
  users: "Users",
  monetization: "Monetization",
  analytics: "Analytics",
  settings: "Settings",
};

function viewPath(view) {
  if (view === "series-detail") {
    return window.location.pathname;
  }

  if (view === "series-new") {
    return `${adminBasePath}/series/new`;
  }

  return `${adminBasePath}/${view}`;
}

function viewFromPath() {
  const prefix = `${adminBasePath}/`;
  const path = window.location.pathname;
  if (!path.startsWith(prefix)) {
    return "";
  }

  const parts = path.slice(prefix.length).split("/");
  if (parts[0] === "series-new" || (parts[0] === "series" && parts[1] === "new")) {
    return "series-new";
  }

  if (parts[0] === "series" && parts[1]) {
    return "series-detail";
  }

  return parts[0] || "";
}

function setView(nextView, options = {}) {
  if (!titles[nextView]) {
    nextView = "dashboard";
  }

  const navView = nextView === "series-detail" || nextView === "series-new" ? "series" : nextView;

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === navView);
  });

  views.forEach((view) => {
    view.classList.toggle("active", view.id === nextView);
  });

  if (viewTitle) {
    viewTitle.textContent = titles[nextView] || "Dashboard";
  }

  if (options.updateUrl !== false) {
    const nextUrl = viewPath(nextView);
    const method = options.replaceUrl ? "replaceState" : "pushState";
    history[method]({ view: nextView }, "", nextUrl);
  }

  if (options.focusTarget) {
    focusTarget(options.focusTarget);
  }
}

function setSidebarOpen(isOpen) {
  sidebar?.classList.toggle("open", isOpen);
  sidebarOverlay?.classList.toggle("visible", isOpen);
  document.body.classList.toggle("sidebar-open", isOpen);
  sidebarToggles.forEach((toggle) => {
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    setView(item.dataset.view);
    if (window.matchMedia("(max-width: 1080px)").matches) {
      setSidebarOpen(false);
    }
  });
});

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.viewTarget, { focusTarget: button.dataset.focusTarget });
  });
});

document.querySelectorAll("[data-focus-target]").forEach((button) => {
  if (button.dataset.viewTarget) {
    return;
  }

  button.addEventListener("click", () => {
    focusTarget(button.dataset.focusTarget);
  });
});

sidebarToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    setSidebarOpen(!sidebar?.classList.contains("open"));
  });
});

sidebarOverlay?.addEventListener("click", () => {
  setSidebarOpen(false);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSidebarOpen(false);
  }
});

window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 1080px)").matches) {
    setSidebarOpen(false);
  }
});

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";

document.querySelectorAll("[data-poster-form]").forEach((form) => {
  const fileInput = form.querySelector("[data-poster-file]");
  const fileName = form.querySelector("[data-poster-file-name]");
  const dropzone = form.querySelector("[data-poster-dropzone]");
  const preview = form.querySelector("[data-poster-preview]");
  const status = form.querySelector("[data-poster-status]");
  const button = form.querySelector('button[type="submit"]');
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
    if (!file || !button) return;
    event.preventDefault();
    if (button.disabled) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus(status, "Choose a JPEG, PNG, or WebP poster.");
      return;
    }
    if (!file.size || file.size > 10 * 1000 * 1000) {
      setStatus(status, "Choose a poster that is 10 MB or smaller.");
      return;
    }

    button.disabled = true;
    fileInput.disabled = true;
    try {
      if (!uploadedImageId) {
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
      setStatus(status, "Verifying poster…");
      const saved = await postJson(form.action, {
        ...Object.fromEntries(new FormData(form)),
        posterImageId: uploadedImageId,
      });
      window.location.assign(saved.redirectTo);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Poster upload failed.");
    } finally {
      button.disabled = false;
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

  button.addEventListener("click", async () => {
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
        (progress) => setStatus(status, `Uploading to Cloudflare… ${progress}%`),
      );
      updateVideoCard(item, video);
      const finalStatus = await pollStreamStatus(episodeId, video);
      updateVideoCard(item, finalStatus);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Upload failed.");
      if (refreshButton && item.dataset.videoUid) refreshButton.disabled = false;
    } finally {
      button.disabled = false;
      input.disabled = false;
    }
  });
});

document.querySelectorAll("[data-episode-create-form]").forEach((form) => {
  const input = form.querySelector("[data-create-video-file]");
  const fileName = form.querySelector("[data-create-video-file-name]");
  const dropzone = form.querySelector("[data-video-create-dropzone]");
  const status = form.querySelector("[data-create-episode-status]");
  const button = form.querySelector('button[type="submit"]');
  let draftEpisode;

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

    if (!file) {
      return;
    }

    event.preventDefault();
    if (button) {
      button.disabled = true;
    }
    setStatus(status, draftEpisode ? "Preparing video upload…" : "Creating episode…");

    try {
      if (!draftEpisode) {
        draftEpisode = await postJson(form.action, Object.fromEntries(new FormData(form)));
      }
      const video = await uploadCloudflareVideoWithProgress(
        draftEpisode.episodeId,
        file,
        undefined,
        () => setStatus(status, "Uploading to Cloudflare…"),
        (progress) => setStatus(status, `Uploading to Cloudflare… ${progress}%`),
      );
      setStatus(status, video.label);
      await pollStreamStatus(draftEpisode.episodeId, video);
      window.location.assign(draftEpisode.redirectTo || viewPath("episodes"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Episode creation failed.";
      setStatus(status, draftEpisode ? `Episode saved. ${message}` : message);
      if (button) {
        button.disabled = false;
      }
    }
  });
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
    const statusLabel = form.closest("article")?.querySelector("[data-status-label]");
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

      updateStatusForm(form, payload.status || nextStatus, entityType);
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

    if (!window.confirm("Remove this episode?")) {
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

      form.closest(".series-episode-row")?.remove();
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
  const statusLabel = form.closest("article")?.querySelector("[data-status-label]");
  const nextStatus = status === "live" ? "draft" : "live";

  if (statusInput) {
    statusInput.value = nextStatus;
  }

  if (statusLabel) {
    statusLabel.textContent = status;
    statusLabel.classList.remove("live", "draft", "review", "blocked");
    statusLabel.classList.add(status === "processing" ? "review" : status);
  }

  if (statusButton) {
    statusButton.textContent = status === "live" ? (entityType === "series" ? "Move to Draft" : "Draft") : "Publish";
  }
}

function updateVideoCard(item, video) {
  item.dataset.videoUid = video.uid || "";
  setStatus(item.querySelector("[data-video-state]"), video.label);
  setStatus(item.querySelector("[data-upload-status]"), video.error || "");
  const refreshButton = item.querySelector("[data-refresh-video]");
  if (refreshButton) refreshButton.disabled = !video.canRefresh;
  const uploadButton = item.querySelector("[data-upload-video]");
  if (uploadButton) uploadButton.textContent = video.activeReady ? "Replace video" : "Upload";
  const publishForm = item.querySelector("[data-status-form]");
  if (publishForm) updateStatusForm(publishForm, video.status, "episode");
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

  const firstField = target.querySelector("input, select, textarea, button");
  firstField?.focus({ preventScroll: true });
}

window.addEventListener("popstate", () => {
  setView(viewFromPath() || "dashboard", { updateUrl: false });
});

const initialView = viewFromPath() || window.location.hash.replace("#", "") || serverInitialView;
if (initialView) {
  setView(initialView, { updateUrl: false });
}

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
