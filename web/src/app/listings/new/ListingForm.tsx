"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createListing, getPresignedUrl } from "@/lib/actions";
import { ListingSchema } from "@/lib/schemas";

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none";
const labelCls = "block text-sm font-medium text-gray-700 mb-1";
const fieldErrorCls = "text-xs text-red-500 mt-1";

type FieldErrors = Partial<Record<string, string>>;

export default function ListingForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // ─── Image upload ───────────────────────────────────────────────────────────

  async function uploadToS3(file: File): Promise<string> {
    const result = await getPresignedUrl(file.name, file.type);
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
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(uploadToS3));
      setImages((prev) => [...prev, ...urls]);
    } catch {
      toast.error("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected after an error
      e.target.value = "";
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

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
      const result = await createListing(null, formData);
      if (!result) return;
      if ("error" in result) {
        setServerError(result.error);
      } else if ("toast" in result) {
        toast.success(result.toast, {
          description: "Our AI will review it for quality and flag anything suspicious.",
          duration: 5000,
        });
        router.push("/dashboard");
      }
    });
  }

  const busy = isPending || uploading;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Title */}
      <div>
        <label className={labelCls}>Listing title</label>
        <input
          name="title"
          type="text"
          placeholder="e.g. Sunny 2BR near ASU campus"
          className={inputCls}
        />
        {fieldErrors.title && <p className={fieldErrorCls}>{fieldErrors.title}</p>}
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <textarea
          name="description"
          rows={4}
          placeholder="Tell renters about the space, vibe, nearby amenities..."
          className={`${inputCls} resize-none`}
        />
        {fieldErrors.description && (
          <p className={fieldErrorCls}>{fieldErrors.description}</p>
        )}
      </div>

      {/* Address */}
      <div>
        <label className={labelCls}>Address</label>
        <input
          name="address"
          type="text"
          placeholder="123 College Ave, Tempe, AZ 85281"
          className={inputCls}
        />
        {fieldErrors.address && <p className={fieldErrorCls}>{fieldErrors.address}</p>}
      </div>

      {/* University */}
      <div>
        <label className={labelCls}>Nearest university</label>
        <input
          name="university_near"
          type="text"
          placeholder="e.g. ASU, UCLA"
          className={inputCls}
        />
      </div>

      {/* Rent + Bedrooms */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Monthly rent ($)</label>
          <input
            name="rent"
            type="number"
            min="0"
            step="50"
            placeholder="1200"
            className={inputCls}
          />
          {fieldErrors.rent && <p className={fieldErrorCls}>{fieldErrors.rent}</p>}
        </div>
        <div>
          <label className={labelCls}>Bedrooms</label>
          <select name="bedrooms" defaultValue="1" className={`${inputCls} bg-white`}>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4+</option>
          </select>
        </div>
      </div>

      {/* Bathrooms + Available from */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Bathrooms</label>
          <select name="bathrooms" defaultValue="1" className={`${inputCls} bg-white`}>
            <option value="1">1</option>
            <option value="1.5">1.5</option>
            <option value="2">2</option>
            <option value="2.5">2.5</option>
            <option value="3">3+</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Available from</label>
          <input name="available_from" type="date" className={inputCls} />
          {fieldErrors.available_from && (
            <p className={fieldErrorCls}>{fieldErrors.available_from}</p>
          )}
        </div>
      </div>

      {/* Available until */}
      <div>
        <label className={labelCls}>Available until (optional)</label>
        <input name="available_to" type="date" className={inputCls} />
      </div>

      {/* Image upload */}
      <div>
        <label className={labelCls}>Photos (optional)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={handleImageChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 disabled:opacity-50 cursor-pointer"
        />
        {uploading && (
          <p className="text-xs text-gray-400 mt-1">Uploading to S3...</p>
        )}
        {images.length > 0 && (
          <ul className="mt-2 space-y-1">
            {images.map((url, i) => (
              <li key={i} className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                <span className="truncate">{url.split("/").pop()}</span>
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="ml-3 text-red-400 hover:text-red-600 shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {serverError && <p className="text-sm text-red-500">{serverError}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition text-sm"
      >
        {isPending ? "Posting..." : uploading ? "Uploading photos..." : "Post Sublease"}
      </button>
    </form>
  );
}
