import BrandLogo from "../../../components/BrandLogo";

// Text colour goes on an inner <span>, never on a <button> itself: antd's
// global reset sets `button { color: inherit }` outside any CSS layer, which
// beats Tailwind's layered text-* utilities on a button element.

/** The frame of the customer-facing complaint pages — narrow, plain, light. */
function PublicShell({ children }) {
  return (
    <div className="min-h-screen bg-[#f3f5f9] px-4 py-5 text-[#1f2937]">
      <div className="mx-auto w-full max-w-md">
        <BrandLogo layout="horizontal" className="mb-5 w-40" />
        {children}
        <p className="mt-8 text-center text-xs text-gray-500">Smartrays Solutions · Rooftop solar</p>
      </div>
    </div>
  );
}

export default PublicShell;
