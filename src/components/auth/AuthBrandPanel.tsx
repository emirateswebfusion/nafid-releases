import { BarChart3, Boxes, ScanLine } from 'lucide-react';

export function AuthBrandPanel() {
  return (
    <aside className="hidden lg:flex w-[45%] flex-col justify-between p-12 relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10 border-r border-border">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="" className="w-11 h-11 rounded-xl object-contain bg-primary/10 p-1" />
        <div><p className="text-3xl font-black tracking-tight">NAFID</p><p className="text-sm text-muted-foreground">The smarter way to sell</p></div>
      </div>
      <div className="space-y-7 py-10">
        <div className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">Built for your everyday business</div>
        <h1 className="text-4xl xl:text-5xl font-black leading-[1.15] tracking-tight">Your shop.<br /><span className="text-primary">One connected workspace.</span></h1>
        <p className="text-muted-foreground leading-relaxed max-w-md">From the first sale to the end-of-day report, keep your counter, stock and accounts together.</p>
        <div className="space-y-4">
          {[
            { icon: ScanLine, title: 'Keep the counter moving', text: 'Fast billing with offline access for your shop.' },
            { icon: Boxes, title: 'Know what is in stock', text: 'Manage products, purchases and stock in one place.' },
            { icon: BarChart3, title: 'See how your day adds up', text: 'Follow sales, payments and daily reports.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="rounded-xl border border-border bg-background p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
              <div><p className="text-sm font-semibold">{title}</p><p className="text-xs leading-relaxed mt-1 text-muted-foreground">{text}</p></div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">&copy; {new Date().getFullYear()} Emirates WebFusion (NAFID). All rights reserved.</p>
    </aside>
  );
}
