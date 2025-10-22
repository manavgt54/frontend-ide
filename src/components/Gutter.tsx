import { useEffect, useRef, useState } from 'react'

export type Direction = 'vertical' | 'horizontal'

export function Gutter({ direction, onDrag, onEnd, className }: { direction: Direction; onDrag: (clientPos: number) => void; onEnd?: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      
      // Set pointer capture for better drag handling
      if (el.setPointerCapture) {
        el.setPointerCapture(e.pointerId)
      }

      const move = (ev: PointerEvent) => {
        ev.preventDefault()
        if (direction === 'vertical') {
          onDrag(ev.clientX)
        } else {
          onDrag(ev.clientY)
        }
      }

      const up = (ev: PointerEvent) => {
        ev.preventDefault()
        setIsDragging(false)
        
        // Release pointer capture
        if (el.releasePointerCapture) {
          el.releasePointerCapture(ev.pointerId)
        }
        
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        onEnd?.()
      }

      window.addEventListener('pointermove', move, { passive: false })
      window.addEventListener('pointerup', up, { passive: false })
    }

    el.addEventListener('pointerdown', onPointerDown)
    return () => el.removeEventListener('pointerdown', onPointerDown)
  }, [direction, onDrag, onEnd])

  const base = direction === 'vertical' ? 'cursor-col-resize self-stretch' : 'cursor-row-resize w-full'
  const sizeStyle = direction === 'vertical' ? { width: '8px' } : { height: '8px' }

  return (
    <div 
      ref={ref} 
      className={`${base} ${className || ''} transition-colors duration-150`} 
      style={{ 
        background: isDragging ? 'var(--accent)' : 'var(--gutter)', 
        ...sizeStyle,
        position: 'relative'
      }}
      title={direction === 'vertical' ? 'Drag to resize width' : 'Drag to resize height'}
    >
      {/* Visual indicator for dragging */}
      {isDragging && (
        <div 
          className="absolute inset-0 bg-[var(--accent)] opacity-20"
          style={{ zIndex: 1000 }}
        />
      )}
    </div>
  )
}
