/** shadcn/ui Toaster (sonner): short confirmations, announced politely, in the carbon colours. */
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return <Sonner position="bottom-center" duration={1800} toastOptions={{ unstyled: true, classNames: { toast: 'toast' } }} {...props} />;
}
export { toast } from 'sonner';
