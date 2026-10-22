import test from "node:test";
import assert from "node:assert/strict";
import { recordingType } from "../assets/js/particle-life-sharing.js";

test("recording prefers explicit H.264 MP4 over other available containers", () => {
  assert.equal(recordingType({ isTypeSupported: () => true }), "video/mp4;codecs=avc1.42E01F");
});
test("WebM fallback retains its actual format instead of pretending to be an MP4", () => {
  assert.equal(recordingType({ isTypeSupported: type => type.startsWith("video/webm") }), "video/webm;codecs=vp8");
});
test("recording support is optional, including older recording APIs", () => {
  assert.equal(recordingType(undefined), ""); assert.equal(recordingType({}), ""); assert.equal(recordingType({ isTypeSupported: () => false }), "");
  assert.equal(recordingType({ isTypeSupported: type => type === "video/mp4" }), "video/mp4");
});
