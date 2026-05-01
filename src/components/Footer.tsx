import { Container } from "./Container";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 py-10 text-sm text-white/60">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row">
          <div>
            <div className="font-semibold text-white">Monday Racing League</div>
            <div className="mt-1">F1 26 Simracing Liga</div>
          </div>
          <div className="text-xs text-white/50">
            © {new Date().getFullYear()} MRL
          </div>
        </div>
      </Container>
    </footer>
  );
}
