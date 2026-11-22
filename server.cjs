const http = require("http");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 80;
const DIST = path.join(__dirname, "dist");

// Contrato de token SSO v1 — o hub (miso4apps) assina um JWT curto (Ed25519)
// com a chave privada dele; aqui só existe a pública (HUB_SSO_PUBLIC_KEY).
// Mesmo fluxo do miso4proj/server.js. O login só existe por aqui: o
// cadastro público fica desligado no Supabase deste app.
const HUB_ISSUER = "https://miso4apps.com.br";
const APP_SLUG = "miso4slope";

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".woff": "font/woff", ".ttf": "font/ttf", ".webp": "image/webp",
  ".webmanifest": "application/manifest+json", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function serveFile(res, filePath) {
  if (!filePath.startsWith(DIST)) return false;
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
      if (filePath.includes(`${path.sep}assets${path.sep}`)) headers["Cache-Control"] = "public, max-age=31536000, immutable";
      res.writeHead(200, headers);
      res.end(fs.readFileSync(filePath));
      return true;
    }
  } catch {}
  return false;
}

// Reconstrói um PEM válido não importa como o secret foi colado (com \n
// literal, com quebras reais, com "HUB_SSO_PUBLIC_KEY=" na frente).
function normalizePem(raw, label) {
  const beginIdx = raw.indexOf("-----BEGIN");
  const trimmed = beginIdx >= 0 ? raw.slice(beginIdx) : raw;
  const base64 = trimmed
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\\n/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleSSO(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;

  try {
    const { token } = JSON.parse(body);
    const jose = await import("jose");

    const rawKey = process.env.HUB_SSO_PUBLIC_KEY || "";
    const appUrl = process.env.SUPABASE_URL;
    const appServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!rawKey || !appUrl || !appServiceKey) {
      return json(res, 500, { success: false, error: "Configuração SSO incompleta no servidor" });
    }

    let payload;
    try {
      const publicKey = await jose.importSPKI(normalizePem(rawKey, "PUBLIC KEY"), "EdDSA");
      ({ payload } = await jose.jwtVerify(token, publicKey, { issuer: HUB_ISSUER, audience: APP_SLUG }));
    } catch (err) {
      console.error("[sso] falha na verificação do JWT:", err?.code, err?.message);
      const motivo = err?.code === "ERR_JWT_EXPIRED"
        ? "Token expirado — volte ao MISO4Apps e clique de novo."
        : err?.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED"
          ? "Assinatura do token inválida — confira a HUB_SSO_PUBLIC_KEY deste app."
          : "Token inválido.";
      return json(res, 400, { success: false, error: motivo });
    }

    const { jti, email, name } = payload;
    if (!jti || !email) return json(res, 400, { success: false, error: "Token malformado" });

    const appAdmin = createClient(appUrl, appServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Reivindica o jti atomicamente — chave duplicada = replay
    const { error: jtiError } = await appAdmin.from("sso_redeemed_tokens").insert({ jti });
    if (jtiError) {
      const msg = jtiError.code === "23505" ? "Token já utilizado" : `Erro ao registrar token: ${jtiError.message}`;
      return json(res, 400, { success: false, error: msg });
    }

    const { data: userList } = await appAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existing = userList?.users?.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
    if (!existing) {
      const { error: createError } = await appAdmin.auth.admin.createUser({
        email, email_confirm: true,
        user_metadata: { full_name: name || "", sso_user: true },
      });
      if (createError) return json(res, 500, { success: false, error: `Erro ao criar usuário: ${createError.message}` });
    }

    const { data: linkData, error: linkError } = await appAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError) return json(res, 500, { success: false, error: `Erro ao gerar sessão: ${linkError.message}` });

    return json(res, 200, { success: true, token_hash: linkData?.properties?.hashed_token, email });
  } catch (e) {
    console.error("SSO Error:", e);
    return json(res, 500, { success: false, error: "Erro interno: " + (e.message || String(e)) });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/sso") {
    await handleSSO(req, res);
    return;
  }

  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url !== "/" && serveFile(res, path.join(DIST, url))) return;
  // SPA: qualquer rota que não seja arquivo real cai no index.html
  res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-cache" });
  res.end(fs.readFileSync(path.join(DIST, "index.html")));
});

server.listen(PORT, () => console.log(`Server on port ${PORT}`));
