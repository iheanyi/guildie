import assert from "node:assert/strict";
import { test } from "node:test";
import { allowsSelfSigned, isExternalOpenable, isGuildieUrl, isSignInUrl, originOf, staysInWindow } from "./origins.ts";

test("Guildie's own sites get the bridge", () => {
	for (const url of [
		"https://guildie.club/",
		"https://guildie.club/g/some-guild",
		"https://auth-flow.preview.guildie.club/me",
		"https://guildie.localhost:1355/",
		"https://desktop.guildie.localhost:1355/sign-in",
	]) {
		assert.ok(isGuildieUrl(url), url);
	}
	for (const url of [
		"http://guildie.club/",
		"https://guildie.club.evil.com/",
		"https://evilguildie.club/",
		"https://gateway.guildie.club/oauth/battlenet/callback",
		"https://oauth.battle.net/authorize",
		"https://merry-fish-229.convex.site/",
		"file:///C:/Windows/",
		"about:blank",
		"not a url",
	]) {
		assert.ok(!isGuildieUrl(url), url);
	}
});

test("sign-in hops stay in the window, without the bridge", () => {
	for (const url of [
		"https://oauth.battle.net/authorize?x=1",
		"https://account.battle.net/login",
		"https://gateway-dev.guildie.club/oauth/battlenet/callback",
		"https://gateway.guildie.club/oauth/claim/callback",
		"https://merry-fish-229.convex.site/oauth/claim/callback",
		"http://127.0.0.1:3271/oauth/claim/callback",
	]) {
		assert.ok(isSignInUrl(url), url);
		assert.ok(staysInWindow(url), url);
	}
	for (const url of ["https://battle.net.evil.com/", "http://oauth.battle.net/", "https://convex.site.evil.com/", "http://10.0.0.1/"]) {
		assert.ok(!staysInWindow(url), url);
	}
});

test("other links open in the browser; only web and mail links", () => {
	assert.ok(!staysInWindow("https://github.com/natedunn/guildie"));
	assert.ok(isExternalOpenable("https://github.com/natedunn/guildie"));
	assert.ok(isExternalOpenable("mailto:hi@guildie.club"));
	assert.ok(!isExternalOpenable("file:///C:/Windows/System32/calc.exe"));
	assert.ok(!isExternalOpenable("ms-settings:"));
	assert.ok(!isExternalOpenable("javascript:alert(1)"));
});

test("self-signed certificates for local dev only; origins", () => {
	assert.ok(allowsSelfSigned("desktop.guildie.localhost"));
	assert.ok(allowsSelfSigned("localhost"));
	assert.ok(!allowsSelfSigned("guildie.club"));
	assert.ok(!allowsSelfSigned("localhost.evil.com"));
	assert.equal(originOf("https://auth-flow.preview.guildie.club/me?x=1"), "https://auth-flow.preview.guildie.club");
	assert.equal(originOf("nope"), undefined);
});
