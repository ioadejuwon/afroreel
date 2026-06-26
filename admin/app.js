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
  let posterPreviewUrl = "";

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
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
    const dataInput = form.querySelector("[data-poster-data]");
    const file = fileInput?.files?.[0];

    if (!file || !dataInput) {
      return;
    }

    event.preventDefault();

    if (file.size > 20 * 1024 * 1024) {
      alert("Poster image must be 20 MB or smaller.");
      return;
    }

    dataInput.value = await readAsDataUrl(file);
    form.submit();
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
    const input = item?.querySelector("[data-video-file]");
    const status = item?.querySelector("[data-upload-status]");
    const videoState = item?.querySelector("[data-video-state]");
    const attachedVideo = item?.querySelector("[data-attached-video]");
    const file = input?.files?.[0];
    const episodeId = item?.dataset.episodeId;

    if (!item || !file || !episodeId) {
      alert("Choose a video file first.");
      return;
    }

    button.disabled = true;
    setStatus(status, "Preparing video upload...");

    try {
      const upload = await uploadLocalVideoWithProgress(episodeId, file, (progress) => {
        setStatus(status, `Uploading video... ${progress}%`);
      });
      item.dataset.videoUid = upload.uid;
      setStatus(status, "Video attached.");
      if (videoState) {
        videoState.textContent = "Ready";
      }
      if (attachedVideo) {
        attachedVideo.textContent = `Video: ${file.name}`;
      }
      if (fileName) {
        fileName.textContent = file.name;
      }
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Upload failed.");
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll("[data-episode-create-form]").forEach((form) => {
  const input = form.querySelector("[data-create-video-file]");
  const fileName = form.querySelector("[data-create-video-file-name]");
  const dropzone = form.querySelector("[data-video-create-dropzone]");
  const status = form.querySelector("[data-create-episode-status]");
  const button = form.querySelector('button[type="submit"]');

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
    setStatus(status, "Creating episode...");

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

      if (!response.ok || !payload.episodeId) {
        throw new Error(payload.error || response.statusText || "Episode creation failed.");
      }

      setStatus(status, "Preparing video upload...");
      await uploadLocalVideoWithProgress(payload.episodeId, file, (progress) => {
        setStatus(status, `Uploading video... ${progress}%`);
      });
      setStatus(status, "Video attached.");
      window.location.assign(payload.redirectTo || viewPath("episodes"));
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Episode creation failed.");
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
    const uid = item?.dataset.videoUid;
    const status = item?.querySelector("[data-upload-status]");
    const videoState = item?.querySelector("[data-video-state]");

    if (!episodeId || !uid) {
      return;
    }

    button.disabled = true;
    setStatus(status, "Checking video...");

    try {
      const video = await postJson(appUrl(`/admin/api/episodes/${episodeId}/refresh-video`), { uid });
      setStatus(status, video.ready ? "Ready" : "Still processing");
      if (videoState) {
        videoState.textContent = video.ready ? "Ready" : "Processing";
      }
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Refresh failed.");
    } finally {
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

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Could not read poster image.")));
    reader.readAsDataURL(file);
  });
}

function uploadLocalVideoWithProgress(episodeId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", appUrl(`/admin/api/episodes/${episodeId}/local-video`));
    request.timeout = 30 * 60 * 1000;
    request.setRequestHeader("content-type", file.type || "application/octet-stream");
    request.setRequestHeader("csrf-token", csrfToken);
    request.setRequestHeader("x-file-name", file.name);

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    });

    request.addEventListener("load", () => {
      const payload = parseJsonResponse(request.responseText);
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(payload.error || request.statusText || "Upload failed."));
        return;
      }

      onProgress(100);
      resolve(payload);
    });

    request.addEventListener("error", () => reject(new Error("Video upload failed. Check the connection and try again.")));
    request.addEventListener("timeout", () => reject(new Error("Video upload timed out. Try a smaller file or a stronger connection.")));
    request.send(file);
  });
}

function parseJsonResponse(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
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
      "content-type": "application/json",
      "csrf-token": csrfToken,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || response.statusText);
  }

  return payload;
}

function setStatus(element, value) {
  if (element) {
    element.textContent = value;
  }
}
