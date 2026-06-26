"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UniversityCombobox } from "@/components/UniversityCombobox";
import { createListing, updateListing, getPresignedUrl } from "@/lib/actions";
import { ListingSchema } from "@/lib/schemas";
import { capture } from "@/lib/posthog/client";

const inputCls =
  "w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-slate-50 placeholder:text-slate-400 transition";
const labelCls = "block text-sm font-semibold text-slate-700 mb-2";
const fieldErrorCls = "text-xs text-red-500 mt-1.5 flex items-center gap-1";

type FieldErrors = Partial<Record<string, string>>;

const sectionIcons: Record<string, React.ReactNode> = {
  details: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="3" stroke="#6366f1" strokeWidth="1.4" />
      <path d="M5 6h8M5 9h8M5 12h5" stroke="#6366f1" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  location: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2C6.24 2 4 4.24 4 7c0 4 5 9 5 9s5-5 5-9c0-2.76-2.24-5-5-5z" stroke="#6366f1" strokeWidth="1.4" />
      <circle cx="9" cy="7" r="1.8" stroke="#6366f1" strokeWidth="1.4" />
    </svg>
  ),
  pricing: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="#6366f1" strokeWidth="1.4" />
      <path d="M9 5v1.5M9 11.5V13M6.5 8.5C6.5 7.4 7.6 7 9 7s2.5.7 2.5 1.7c0 1-1 1.5-2.5 1.5s-2.5.7-2.5 1.8c0 1 1.1 1.5 2.5 1.5s2.5-.4 2.5-1.5" stroke="#6366f1" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  photos: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="4" width="14" height="11" rx="2" stroke="#6366f1" strokeWidth="1.4" />
      <circle cx="6.5" cy="8.5" r="1.5" stroke="#6366f1" strokeWidth="1.2" />
      <path d="M2 12l4-3.5 3 2.5 2-2 5 4" stroke="#6366f1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-6 pb-4 border-b border-slate-100">
      <span className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
        {sectionIcons[icon]}
      </span>
      <div>
        <h3 className="font-bold text-slate-900 text-base">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

export interface ListingInitialValues {
  title?: string;
  description?: string;
  address?: string;
  university_near?: string;
  rent?: string;
  bedrooms?: string;
  bathrooms?: string;
  available_from?: string;
  available_to?: string;
  images?: string[];
}

interface ListingFormProps {
  onImagesChange?: (count: number) => void;
  initialValues?: ListingInitialValues;
  mode?: "create" | "edit";
  listingId?: string;
}

export default function ListingForm({ onImagesChange, initialValues, mode = "create", listingId }: ListingFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [images, setImages] = useState<string[]>(initialValues?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  async function uploadToS3(file: File): Promise<string> {
    const result = await getPresignedUrl(file.name, file.type, file.size, listingId);
    if ("error" in result) throw new Error(result.error);
    const uploadRes = await fetch(result.url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!uploadRes.ok) throw new Error("Upload failed");
    return result.publicUrl;
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        setServerError(`${file.name} is too large. Maximum size is 10MB.`);
        e.target.value = "";
        return;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setServerError(`${file.name} is not a supported image type. Use JPEG, PNG, WebP, or GIF.`);
        e.target.value = "";
        return;
      }
    }

    setServerError(null);
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(uploadToS3));
      setImages((prev) => {
        const next = [...prev, ...urls];
        onImagesChange?.(next.length);
        return next;
      });
    } catch {
      toast.error("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      onImagesChange?.(next.length);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);

    const rawData = Object.fromEntries(new FormData(formRef.current!));
    const parsed = ListingSchema.safeParse(rawData);

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    const formData = new FormData(formRef.current!);
    images.forEach((url) => formData.append("images", url));

    startTransition(async () => {
      const action = mode === "edit" && listingId
        ? updateListing.bind(null, listingId)
        : createListing;
      const result = await action(null, formData);
      if (!result) return;
      if ("error" in result) {
        setServerError(result.error);
      } else if ("toast" in result) {
        if (mode !== "edit") {
          capture("listing_created", {
            rent_cents: Math.round(parseFloat(parsed.data.rent) * 100),
            bedrooms: parseInt(parsed.data.bedrooms, 10),
            bathrooms: parseFloat(parsed.data.bathrooms),
            university_near: parsed.data.university_near,
            image_count: images.length,
            has_end_date: !!parsed.data.available_to,
          });
        }
        toast.success(result.toast, {
          description: mode === "edit"
            ? "Your changes are live."
            : "Our AI will review it for quality and flag anything suspicious.",
          duration: 5000,
        });
        router.push(mode === "edit" ? "/listings/my" : "/dashboard");
      }
    });
  }

  const busy = isPending || uploading;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-8" noValidate>
      {/* Section 1 — Listing details */}
      <div>
        <SectionHeader icon="details" title="Listing details" subtitle="Help renters understand what you're offering" />
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Listing title</label>
            <input
              name="title"
              type="text"
              placeholder="e.g. Sunny 2BR near UT campus, furnished, pet-friendly"
              defaultValue={initialValues?.title}
              className={inputCls}
            />
            {fieldErrors.title && (
              <p className={fieldErrorCls}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef4444" strokeWidth="1.2"/><path d="M6 4v2.5M6 8.5h.01" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              name="description"
              rows={5}
              placeholder="Tell renters about the space, vibe, nearby amenities, what's included in rent (utilities, wifi, parking)..."
              defaultValue={initialValues?.description}
              className={`${inputCls} resize-none`}
            />
            {fieldErrors.description && (
              <p className={fieldErrorCls}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef4444" strokeWidth="1.2"/><path d="M6 4v2.5M6 8.5h.01" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {fieldErrors.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Section 2 — Location */}
      <div>
        <SectionHeader icon="location" title="Location" subtitle="Where is the property and which university is nearby?" />
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Street address</label>
            <input
              name="address"
              type="text"
              placeholder="123 College Ave, Austin, TX 78701"
              defaultValue={initialValues?.address}
              className={inputCls}
            />
            {fieldErrors.address && (
              <p className={fieldErrorCls}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef4444" strokeWidth="1.2"/><path d="M6 4v2.5M6 8.5h.01" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {fieldErrors.address}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Nearest university</label>
            <UniversityCombobox
              name="university_near"
              placeholder="e.g. UT Austin, UCLA, Georgia Tech"
              defaultValue={initialValues?.university_near}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Section 3 — Pricing & details */}
      <div>
        <SectionHeader icon="pricing" title="Pricing & details" subtitle="Set your rent and specify the space" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Monthly rent ($)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
              <input
                name="rent"
                type="number"
                min="0"
                step="50"
                placeholder="1,200"
                defaultValue={initialValues?.rent}
                className={`${inputCls} pl-8`}
              />
            </div>
            {fieldErrors.rent && (
              <p className={fieldErrorCls}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef4444" strokeWidth="1.2"/><path d="M6 4v2.5M6 8.5h.01" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {fieldErrors.rent}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Bedrooms</label>
            <select name="bedrooms" defaultValue={initialValues?.bedrooms ?? "1"} className={`${inputCls} bg-white cursor-pointer`}>
              <option value="1">1 bedroom</option>
              <option value="2">2 bedrooms</option>
              <option value="3">3 bedrooms</option>
              <option value="4">4+ bedrooms</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Bathrooms</label>
            <select name="bathrooms" defaultValue={initialValues?.bathrooms ?? "1"} className={`${inputCls} bg-white cursor-pointer`}>
              <option value="1">1 bath</option>
              <option value="1.5">1.5 baths</option>
              <option value="2">2 baths</option>
              <option value="2.5">2.5 baths</option>
              <option value="3">3+ baths</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Available from</label>
            <input name="available_from" type="date" defaultValue={initialValues?.available_from} className={inputCls} />
            {fieldErrors.available_from && (
              <p className={fieldErrorCls}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef4444" strokeWidth="1.2"/><path d="M6 4v2.5M6 8.5h.01" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {fieldErrors.available_from}
              </p>
            )}
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Available until <span className="text-slate-400 font-normal">(optional)</span></label>
            <input name="available_to" type="date" defaultValue={initialValues?.available_to} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Section 4 — Photos */}
      <div>
        <SectionHeader icon="photos" title="Photos" subtitle="Listings with photos get 3× more inquiries" />

        <label className="relative flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/30 transition cursor-pointer group">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mb-2 text-slate-400 group-hover:text-indigo-500 transition">
            <rect x="2" y="6" width="28" height="20" rx="4" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 6l2-3h8l2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="text-sm font-medium text-slate-600 group-hover:text-indigo-600 transition">Click to upload photos</p>
          <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 10MB each</p>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={handleImageChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
        </label>

        {uploading && (
          <div className="flex items-center gap-2 mt-3 text-sm text-indigo-600">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Uploading to secure storage...
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((url, i) => (
              <div key={i} className="relative group rounded-xl overflow-hidden aspect-video bg-slate-100">
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {serverError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
            <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 11h.01" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-red-600">{serverError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition shadow-sm shadow-indigo-200 text-sm"
      >
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Posting your sublease...
          </span>
        ) : uploading ? "Uploading photos..." : mode === "edit" ? "Save changes →" : "Post sublease →"}
      </button>
    </form>
  );
}
