import { Link } from 'react-router-dom'
import { Bubbles } from '../components/Bubbles'
import { Button } from '../components/ui'

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-900 px-4 text-center">
      <Bubbles count={14} />
      <div className="relative">
        <p className="text-gradient text-8xl font-extrabold">404</p>
        <h1 className="mt-4 text-2xl font-bold text-white">We've cleaned everywhere, but this page isn't here.</h1>
        <p className="mt-2 text-slate-400">It may have been moved, or it never existed.</p>
        <Link to="/" className="mt-8 inline-block"><Button>Take me home</Button></Link>
      </div>
    </div>
  )
}
