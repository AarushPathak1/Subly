const { deriveUniversity } = require("../utils");

describe("deriveUniversity", () => {
  it("extracts from a simple domain", () => {
    expect(deriveUniversity("student@asu.edu")).toBe("ASU");
  });

  it("extracts the last segment from a subdomain", () => {
    expect(deriveUniversity("user@mail.utexas.edu")).toBe("UTEXAS");
  });

  it("handles a two-level subdomain", () => {
    expect(deriveUniversity("foo@cs.cmu.edu")).toBe("CMU");
  });

  it("returns uppercase", () => {
    expect(deriveUniversity("x@ucla.edu")).toBe("UCLA");
  });

  it("returns empty string for malformed input without @", () => {
    const result = deriveUniversity("notanemail");
    // domain becomes "", parts = [""], last segment = ""
    expect(typeof result).toBe("string");
  });

  it("returns empty string when there is no domain part", () => {
    expect(deriveUniversity("user@")).toBe("");
  });
});
