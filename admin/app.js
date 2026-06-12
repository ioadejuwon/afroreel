const navItems = Array.from(document.querySelectorAll(".nav-item"));
const views = Array.from(document.querySelectorAll(".view"));
const viewTitle = document.querySelector("#view-title");
const sidebar = document.querySelector("#admin-sidebar");
const sidebarOverlay = document.querySelector("[data-sidebar-overlay]");
const sidebarToggles = Array.from(document.querySelectorAll("[data-sidebar-toggle]"));

const titles = {
  dashboard: "Dashboard",
  series: "Series",
  episodes: "Episodes",
  users: "Users",
  monetization: "Monetization",
  analytics: "Analytics",
  settings: "Settings",
};

function setView(nextView) {
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === nextView);
  });

  views.forEach((view) => {
    view.classList.toggle("active", view.id === nextView);
  });

  if (viewTitle) {
    viewTitle.textContent = titles[nextView] || "Dashboard";
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
  form.addEventListener("submit", async (event) => {
    const fileInput = form.querySelector("[data-poster-file]");
    const dataInput = form.querySelector("[data-poster-data]");
    const file = fileInput?.files?.[0];

    if (!file || !dataInput) {
      return;
    }

    event.preventDefault();

    if (file.size > 2 * 1024 * 1024) {
      alert("Poster image must be 2 MB or smaller.");
      return;
    }

    dataInput.value = await readAsDataUrl(file);
    form.submit();
  });
});

document.querySelectorAll("[data-upload-video]").forEach((button) => {
  button.addEventListener("click", async () => {
    const row = button.closest("tr");
    const input = row?.querySelector("[data-video-file]");
    const status = row?.querySelector("[data-upload-status]");
    const videoState = row?.querySelector("[data-video-state]");
    const file = input?.files?.[0];
    const episodeId = row?.dataset.episodeId;

    if (!row || !file || !episodeId) {
      alert("Choose a video file first.");
      return;
    }

    button.disabled = true;
    setStatus(status, "Preparing upload...");

    try {
      const upload = await createTusUpload(episodeId, file);
      row.dataset.videoUid = upload.uid;
      await uploadFileWithTus(upload.uploadUrl, file, (percent) => {
        setStatus(status, `Uploading ${percent}%`);
      });
      await postJson(`/admin/api/episodes/${episodeId}/cloudflare-complete`, { uid: upload.uid });
      setStatus(status, "Uploaded. Processing...");
      if (videoState) {
        videoState.textContent = "Processing";
      }
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Upload failed.");
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll("[data-refresh-video]").forEach((button) => {
  button.addEventListener("click", async () => {
    const row = button.closest("tr");
    const episodeId = row?.dataset.episodeId;
    const uid = row?.dataset.videoUid;
    const status = row?.querySelector("[data-upload-status]");
    const videoState = row?.querySelector("[data-video-state]");

    if (!episodeId || !uid) {
      return;
    }

    button.disabled = true;
    setStatus(status, "Checking Cloudflare...");

    try {
      const video = await postJson(`/admin/api/episodes/${episodeId}/refresh-video`, { uid });
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

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Could not read poster image.")));
    reader.readAsDataURL(file);
  });
}

async function createTusUpload(episodeId, file) {
  return postJson("/admin/api/cloudflare/tus-upload-url", {
    episodeId,
    uploadLength: file.size,
    name: file.name,
    maxDurationSeconds: 1800,
  });
}

async function uploadFileWithTus(uploadUrl, file, onProgress) {
  const chunkSize = 8 * 1024 * 1024;
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const response = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
      },
      body: chunk,
    });

    if (!response.ok) {
      throw new Error(`Cloudflare upload failed: ${response.status}`);
    }

    const nextOffset = Number.parseInt(response.headers.get("Upload-Offset") || "", 10);
    offset = Number.isNaN(nextOffset) ? offset + chunk.size : nextOffset;
    onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
  }
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
