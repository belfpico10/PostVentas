// Cliente mínimo de Microsoft Graph con identidad de aplicación (Worker).

function normalize(value) {
  return String(value ?? "").trim();
}

function encodePath(path) {
  return path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

export async function createGraph({ tenantId, clientId, clientSecret }) {
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(
      tenantId
    )}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials"
      })
    }
  );
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error(
      tokenPayload.error_description ||
        "Microsoft Entra no entregó un token para Microsoft Graph."
    );
  }
  const token = tokenPayload.access_token;

  async function request(path, options = {}) {
    const response = await fetch(
      /^https:\/\//i.test(path) ? path : `https://graph.microsoft.com/v1.0${path}`,
      {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(
        payload?.error?.message ||
          `Microsoft Graph respondió con código ${response.status}.`
      );
      error.status = response.status;
      error.code = payload?.error?.code;
      throw error;
    }
    return response;
  }

  async function json(path, options = {}) {
    const response = await request(path, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) }
    });
    return response.json();
  }

  return { request, json };
}

export async function openSharePoint(graph, { hostname, sitePath, library, dataRoot }) {
  const site = await graph.json(
    `/sites/${hostname}:${sitePath}?$select=id,displayName`
  );
  const drives = await graph.json(
    `/sites/${encodeURIComponent(site.id)}/drives?$select=id,name`
  );
  const drive = (drives.value || []).find(
    (item) => normalize(item.name).toLowerCase() === library.toLowerCase()
  );
  if (!drive) {
    throw new Error(`No se encontró la biblioteca “${library}” en ${site.displayName}.`);
  }
  const driveId = encodeURIComponent(drive.id);

  async function ensureFolderPath(relativePath) {
    let parent = await graph.json(`/drives/${driveId}/root?$select=id`);
    const parts = relativePath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    for (const part of parts) {
      const children = await graph.json(
        `/drives/${driveId}/items/${encodeURIComponent(
          parent.id
        )}/children?$select=id,name,folder&$top=999`
      );
      let child = (children.value || []).find(
        (item) => item.folder && normalize(item.name).toLowerCase() === part.toLowerCase()
      );
      if (!child) {
        child = await graph.json(
          `/drives/${driveId}/items/${encodeURIComponent(parent.id)}/children`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: part,
              folder: {},
              "@microsoft.graph.conflictBehavior": "replace"
            })
          }
        );
      }
      parent = child;
    }
    return parent;
  }

  async function put(relativePath, body, contentType) {
    const fullPath = `${dataRoot}/${relativePath}`.replace(/^\/+|\/+$/g, "");
    await ensureFolderPath(fullPath.split("/").slice(0, -1).join("/"));
    await graph.request(`/drives/${driveId}/root:/${encodePath(fullPath)}:/content`, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body
    });
  }

  return {
    async readJson(relativePath, fallback) {
      try {
        const response = await graph.request(
          `/drives/${driveId}/root:/${encodePath(`${dataRoot}/${relativePath}`)}:/content`
        );
        return await response.json();
      } catch (error) {
        if (error.status === 404) return fallback;
        throw error;
      }
    },
    writeJson(relativePath, payload) {
      return put(
        relativePath,
        `${JSON.stringify(payload, null, 2)}\n`,
        "application/json; charset=utf-8"
      );
    },
    writeBinary(relativePath, buffer, contentType) {
      return put(relativePath, buffer, contentType);
    }
  };
}

export async function sendMail(graph, mailbox, message) {
  const address = (value) => ({ emailAddress: { address: value } });
  await graph.request(`/users/${encodeURIComponent(mailbox)}/sendMail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: "HTML", content: message.html },
        toRecipients: message.to.map(address),
        ccRecipients: (message.cc || []).map(address),
        bccRecipients: (message.bcc || []).map(address),
        replyTo: (message.replyTo || []).map(address),
        attachments: (message.attachments || []).map((file) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: file.name,
          contentType: file.contentType,
          contentBytes: Buffer.from(file.content).toString("base64")
        }))
      },
      saveToSentItems: true
    })
  });
}
