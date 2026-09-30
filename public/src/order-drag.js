// Sıralama sorusunda öğeleri fareyle ya da parmakla sürükleyerek yer değiştirme.
// Klavye kullanıcıları için ↑/↓ düğmeleri ayrıca çalışmaya devam eder.

/**
 * list: <ol> öğesi. Her <li> data-item ile gösterilen öğenin sırasını taşır.
 * onDrop(order): bırakınca yeni sıra ([2, 0, 3, 1] gibi) bildirilir.
 */
export function enableDrag(list, onDrop) {
  let dragged = null;

  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.order-handle');
    if (!handle || event.button > 0) return;
    dragged = handle.closest('.order-item');
    // Yakalama listede tutulur: öğe DOM içinde taşınınca yakalama kaybolmasın.
    list.setPointerCapture(event.pointerId);
    dragged.classList.add('dragging');
    event.preventDefault();
  });

  list.addEventListener('pointermove', (event) => {
    if (!dragged) return;
    const others = [...list.children].filter((item) => item !== dragged);
    // İmlecin üstünde kaldığı ilk öğenin önüne yerleştir; hiçbiri yoksa en sona.
    const before = others.find((item) => {
      const box = item.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    if (before !== dragged.nextElementSibling) list.insertBefore(dragged, before ?? null);
  });

  const drop = () => {
    if (!dragged) return;
    dragged.classList.remove('dragging');
    dragged = null;
    onDrop([...list.children].map((item) => Number(item.dataset.item)));
  };
  list.addEventListener('pointerup', drop);
  list.addEventListener('pointercancel', drop);
}