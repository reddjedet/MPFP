import { useRef, useEffect } from 'react';

export function useDraggableScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const ele = ref.current;
    if (!ele) return;

    let isDown = false;
    let startX: number;
    let scrollLeft: number;

    const onMouseDown = (e: MouseEvent) => {
      isDown = true;
      ele.style.cursor = 'grabbing';
      startX = e.pageX - ele.offsetLeft;
      scrollLeft = ele.scrollLeft;
    };

    const onMouseLeave = () => {
      isDown = false;
      ele.style.cursor = '';
    };

    const onMouseUp = () => {
      isDown = false;
      ele.style.cursor = '';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - ele.offsetLeft;
      const walk = (x - startX) * 2; // Scroll multiplier
      ele.scrollLeft = scrollLeft - walk;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && e.deltaX === 0) {
        // Only override if not already scrolling at bounds, to allow normal page scroll when reached end?
        // Let's just convert vertical to horizontal scroll.
        const isAtLeft = ele.scrollLeft === 0 && e.deltaY < 0;
        const isAtRight = Math.abs(ele.scrollHeight - ele.clientHeight - ele.scrollTop) < 1 && ele.scrollWidth - ele.clientWidth - ele.scrollLeft < 1 && e.deltaY > 0;
        
        if (!isAtLeft && !isAtRight) {
          e.preventDefault();
          ele.scrollLeft += e.deltaY;
        }
      }
    };

    ele.addEventListener('mousedown', onMouseDown);
    ele.addEventListener('mouseleave', onMouseLeave);
    ele.addEventListener('mouseup', onMouseUp);
    ele.addEventListener('mousemove', onMouseMove);
    ele.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      ele.removeEventListener('mousedown', onMouseDown);
      ele.removeEventListener('mouseleave', onMouseLeave);
      ele.removeEventListener('mouseup', onMouseUp);
      ele.removeEventListener('mousemove', onMouseMove);
      ele.removeEventListener('wheel', onWheel);
    };
  }, []);

  return ref;
}
