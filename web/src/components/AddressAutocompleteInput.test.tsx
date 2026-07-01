import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput";

// Helper: build a mock google.maps.places.Autocomplete class that
// captures the place_changed listener so tests can trigger it manually.
function makeMockAutocomplete(place: object) {
  let storedCb: (() => void) | null = null;
  const instance = {
    addListener: vi.fn((_event: string, cb: () => void) => {
      storedCb = cb;
      // call immediately so tests don't have to advance timers again
      cb();
    }),
    getPlace: vi.fn(() => place),
  };
  const Constructor = vi.fn(() => instance);
  return { Constructor, instance, triggerPlaceChanged: () => storedCb?.() };
}

function installGoogleMock(place: object) {
  const { Constructor, instance } = makeMockAutocomplete(place);
  (window as any).google = {
    maps: {
      places: {
        Autocomplete: Constructor,
      },
    },
  };
  return { Constructor, instance };
}

beforeEach(() => {
  vi.useFakeTimers();
  delete (window as any).google;
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as any).google;
  vi.clearAllMocks();
});

describe("AddressAutocompleteInput", () => {
  it("renders visible input with defaultValue", async () => {
    installGoogleMock({
      formatted_address: "456 Oak St",
      geometry: { location: { lat: () => 30.28, lng: () => -97.73 } },
    });

    render(<AddressAutocompleteInput name="address" defaultValue="456 Oak St" />);
    await act(async () => { vi.runAllTimers(); });

    const input = document.querySelector<HTMLInputElement>("input[name=address]");
    expect(input).not.toBeNull();
    expect(input!.value).toBe("456 Oak St");
  });

  it("renders hidden lat/lng inputs with defaults", async () => {
    installGoogleMock({
      formatted_address: "456 Oak St",
      geometry: { location: { lat: () => 30.28, lng: () => -97.73 } },
    });

    render(
      <AddressAutocompleteInput
        name="address"
        defaultLat="30.28"
        defaultLng="-97.73"
      />
    );
    await act(async () => { vi.runAllTimers(); });

    const latInput = document.querySelector<HTMLInputElement>("input[name=lat]");
    const lngInput = document.querySelector<HTMLInputElement>("input[name=lng]");
    expect(latInput).not.toBeNull();
    expect(lngInput).not.toBeNull();
    expect(latInput!.value).toBe("30.28");
    expect(lngInput!.value).toBe("-97.73");
  });

  it("populates hidden lat/lng when a Place is selected", async () => {
    installGoogleMock({
      formatted_address: "123 Main St",
      geometry: { location: { lat: () => 30.28, lng: () => -97.73 } },
    });

    render(<AddressAutocompleteInput name="address" />);

    await act(async () => {
      vi.runAllTimers();
    });

    const latInput = document.querySelector<HTMLInputElement>("input[name=lat]");
    const lngInput = document.querySelector<HTMLInputElement>("input[name=lng]");
    expect(latInput!.value).toBe("30.28");
    expect(lngInput!.value).toBe("-97.73");
  });

  it("clears hidden lat/lng when user types after selecting", async () => {
    installGoogleMock({
      formatted_address: "123 Main St",
      geometry: { location: { lat: () => 30.28, lng: () => -97.73 } },
    });

    render(<AddressAutocompleteInput name="address" />);

    await act(async () => {
      vi.runAllTimers();
    });

    // verify they were populated first
    const latInput = document.querySelector<HTMLInputElement>("input[name=lat]");
    const lngInput = document.querySelector<HTMLInputElement>("input[name=lng]");
    expect(latInput!.value).toBe("30.28");

    // now simulate the user typing in the visible address input
    const addressInput = document.querySelector<HTMLInputElement>("input[name=address]");
    fireEvent.change(addressInput!, { target: { value: "789 Elm" } });

    expect(latInput!.value).toBe("");
    expect(lngInput!.value).toBe("");
  });

  it("falls back gracefully when window.google is undefined", () => {
    // window.google is already deleted in beforeEach; do not install mock
    render(<AddressAutocompleteInput name="address" />);

    // advance timers to exhaustion (maxAttempts=100 * 50ms = 5000ms)
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    const addressInput = document.querySelector<HTMLInputElement>("input[name=address]");
    expect(addressInput).not.toBeNull();
  });

  it("ignores place_changed with no geometry", async () => {
    installGoogleMock({
      formatted_address: "X",
      // deliberately no geometry property
    });

    render(<AddressAutocompleteInput name="address" defaultLat="1" defaultLng="2" />);

    await act(async () => {
      vi.runAllTimers();
    });

    // The place_changed fired but had no geometry; the state was set from
    // defaultLat/defaultLng initially, but onChange of place_changed with no
    // geometry should leave lat/lng unchanged.
    // Note: the component initialises state to defaultLat/defaultLng and the
    // place_changed handler only calls setLat/setLng when geometry is present.
    const latInput = document.querySelector<HTMLInputElement>("input[name=lat]");
    const lngInput = document.querySelector<HTMLInputElement>("input[name=lng]");
    // Values should remain as the defaults since no geometry was provided
    expect(latInput!.value).toBe("1");
    expect(lngInput!.value).toBe("2");
  });
});
