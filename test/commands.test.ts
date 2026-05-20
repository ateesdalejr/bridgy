import { describe, expect, test } from "bun:test";
import { parseSmsCommand } from "../src/commands";

describe("parseSmsCommand", () => {
  test("parses setup commands", () => {
    expect(parseSmsCommand("START")).toEqual({ type: "start" });
    expect(parseSmsCommand("link")).toEqual({ type: "start" });
  });

  test("parses contact add", () => {
    expect(parseSmsCommand("ADD Mom +1 (555) 123-4567")).toEqual({
      type: "add",
      alias: "mom",
      phone: "+15551234567",
    });
  });

  test("parses alias sends", () => {
    expect(parseSmsCommand("@mom hello there")).toEqual({
      type: "send_alias",
      alias: "mom",
      text: "hello there",
    });
  });

  test("parses phone sends", () => {
    expect(parseSmsCommand("@+15551234567 hello")).toEqual({
      type: "send_phone",
      phone: "+15551234567",
      text: "hello",
    });
  });

  test("plain text stays plain", () => {
    expect(parseSmsCommand("hello back")).toEqual({ type: "plain", text: "hello back" });
  });
});
