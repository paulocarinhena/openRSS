import { describe, expect, it } from "vitest";
import { publicOidcInfo, readOidcConfig } from "@/lib/oidc";

describe("OIDC config", () => {
  it("is disabled without issuer/discovery and client id", () => {
    expect(readOidcConfig({})).toBeNull();
    expect(readOidcConfig({ OIDC_ISSUER: "https://id.example" })).toBeNull();
    expect(publicOidcInfo({})).toBeNull();
  });

  it("derives discovery from the issuer and applies defaults", () => {
    expect(readOidcConfig({ OIDC_ISSUER: "https://id.example/realms/home/", OIDC_CLIENT_ID: "openrss" })).toEqual({
      discoveryUrl: "https://id.example/realms/home/.well-known/openid-configuration",
      clientId: "openrss",
      clientSecret: undefined,
      name: "SSO",
      scopes: ["openid", "email", "profile"],
      autoRegister: true,
      passwordLoginDisabled: false,
    });
  });

  it("reads explicit options and never exposes the secret publicly", () => {
    const env = {
      OIDC_DISCOVERY_URL: "https://auth.example/application/o/openrss/.well-known/openid-configuration",
      OIDC_CLIENT_ID: "id",
      OIDC_CLIENT_SECRET: "s3cret",
      OIDC_PROVIDER_NAME: "Authentik",
      OIDC_SCOPES: "openid,email profile groups",
      OIDC_AUTO_REGISTER: "false",
      OIDC_DISABLE_PASSWORD_LOGIN: "yes",
    };
    expect(readOidcConfig(env)).toMatchObject({ name: "Authentik", scopes: ["openid", "email", "profile", "groups"], autoRegister: false, passwordLoginDisabled: true });
    expect(publicOidcInfo(env)).toEqual({ name: "Authentik", passwordLoginDisabled: true });
  });
});
