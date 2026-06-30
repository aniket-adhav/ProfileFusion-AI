import CandidateTransformer from "./components/CandidateTransformer.jsx";

export default function App() {
  return (
    <div className="relative min-h-screen text-[#e6e8ef]">
      <nav className="relative z-20 border-b border-white/5 bg-[#07080c]/70 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-sm font-semibold tracking-tight">ProfileFusion AI</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-xs text-white/55">
            <a href="#upload" className="hover:text-white transition">Upload</a>
            <a href="#pipeline" className="hover:text-white transition">Pipeline</a>
            <a href="#results" className="hover:text-white transition">Results</a>
          </div>
        </div>
      </nav>

      <CandidateTransformer />

      <footer className="relative z-10 border-t border-white/5 mt-12">
        <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-white/40 text-center">
          ProfileFusion AI · Python pipeline · React UI
        </div>
      </footer>
    </div>
  );
}
