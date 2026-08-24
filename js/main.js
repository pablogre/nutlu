/* ============================================================
   NUTLU · pedidos por WhatsApp
   ============================================================ */

/* Reemplazar por el número real: código de país + número, sin + ni espacios.
   Ej. Argentina Córdoba: '5493511234567' */
const WHATSAPP_NUMBER = '5493364032924';

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** '7.800' -> 7800 */
const parsePrecio = (valor) => Number(String(valor).replace(/\./g, '').replace(',', '.')) || 0;

/** 7800 -> '$ 7.800' */
const formatARS = (n) => `$ ${nf.format(n)}`;

/** unidades mínimas de un mismo producto para acceder al precio por mayor */
const MIN_MAYOR = 3;

/** ¿el producto cotiza por mayor con esta cantidad? */
const aplicaMayor = (p, qty) => p.precioMayorNum > 0 && qty >= MIN_MAYOR;

/** precio unitario vigente: por mayor si alcanza el mínimo, si no el minorista */
const precioAplicado = (p, qty) => (aplicaMayor(p, qty) ? p.precioMayorNum : p.precioNum);

/** 'Dátil Bombón Maní' -> 'datil-bombon-mani' */
const slug = (texto) =>
    texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

/* ---------------- Estado ---------------- */
let productos = [];
const cantidades = Object.create(null);

/* ---------------- Render ---------------- */
/** '$ 6.800 · por mayor' si el producto tiene precio mayorista; vacío si no */
const precioMayor = (p) =>
    p.precioMayorNum > 0
        ? `<span class="precio-mayor">${formatARS(p.precioMayorNum)} <small>por mayor · ${MIN_MAYOR}+ u.</small></span>`
        : '';

function renderProductos() {
    document.getElementById('grid-productos').innerHTML = productos
        .map(
            (p) => `
        <article class="card">
            <img class="card__img" src="${p.main_image}" alt="${p.name}" loading="lazy">
            <div class="card__body">
                <h3 class="card__title">${p.name}</h3>
                <p class="card__price">${formatARS(p.precioNum)}</p>
                ${precioMayor(p)}
                <button class="btn btn--primary card__btn" type="button" data-pedir="${p.id}">Pedir</button>
            </div>
        </article>`
        )
        .join('');
}

/** lista de ingredientes como badges; vacía si el producto no los trae */
function badges(p) {
    if (!p.ingredientes.length) return '';
    return `<ul class="badges" aria-label="Ingredientes de ${p.name}">
                    ${p.ingredientes.map((i) => `<li class="badge">${i}</li>`).join('\n                    ')}
                </ul>`;
}

function renderIngredientes() {
    const total = productos.length;

    document.getElementById('lista-ingredientes').innerHTML = productos
        .map(
            (p, i) => `
        <article class="slide" role="group" aria-roledescription="diapositiva"
            aria-label="${i + 1} de ${total}: ${p.name}">
            <img class="slide__img" src="${p.main_image}" alt="${p.name}" loading="lazy">
            <div class="slide__body">
                <h3 class="slide__title">${p.name}</h3>
                <p class="slide__text">${p.description}</p>
                ${badges(p)}
            </div>
        </article>`
        )
        .join('');

    document.getElementById('ingredientes-dots').innerHTML = productos
        .map(
            (p, i) => `
        <button class="dot" type="button" data-dot="${i}" aria-label="Ver ${p.name}"${i === 0 ? ' aria-current="true"' : ''}></button>`
        )
        .join('');
}

function renderPedido() {
    document.getElementById('lista-pedido').innerHTML = productos
        .map(
            (p) => `
        <div class="linea linea--vacia" data-linea="${p.id}">
            <img class="linea__img" src="${p.main_image}" alt="" loading="lazy">
            <div class="linea__info">
                <p class="linea__name">${p.name}</p>
                <p class="linea__unit">${formatARS(p.precioNum)}</p>
                ${precioMayor(p)}
            </div>
            <div class="stepper">
                <button class="stepper__btn" type="button" data-action="dec" data-id="${p.id}"
                    aria-label="Quitar una unidad de ${p.name}">−</button>
                <input class="stepper__qty" type="number" min="0" step="1" value="0"
                    data-qty="${p.id}" aria-label="Cantidad de ${p.name}">
                <button class="stepper__btn" type="button" data-action="inc" data-id="${p.id}"
                    aria-label="Agregar una unidad de ${p.name}">+</button>
            </div>
            <p class="linea__subtotal" data-subtotal="${p.id}">${formatARS(0)}</p>
        </div>`
        )
        .join('');
}

/* ---------------- Cálculo ---------------- */
function actualizarTotales() {
    let total = 0;

    productos.forEach((p) => {
        const qty = cantidades[p.id];
        const subtotal = qty * precioAplicado(p, qty);
        total += subtotal;

        const linea = document.querySelector(`[data-linea="${p.id}"]`);
        document.querySelector(`[data-qty="${p.id}"]`).value = qty;
        document.querySelector(`[data-subtotal="${p.id}"]`).textContent = formatARS(subtotal);
        linea.classList.toggle('linea--vacia', qty === 0);
        linea.classList.toggle('linea--mayor', aplicaMayor(p, qty));
    });

    document.getElementById('total-pedido').textContent = formatARS(total);
    return total;
}

function setCantidad(id, qty) {
    if (!(id in cantidades)) return;
    cantidades[id] = Math.max(0, Math.floor(Number(qty) || 0));
    actualizarTotales();
}

/* ---------------- Mensaje de WhatsApp ---------------- */
function armarMensaje({ nombre, telefono, ciudad, observaciones }) {
    const lineas = productos
        .filter((p) => cantidades[p.id] > 0)
        .map((p) => {
            const qty = cantidades[p.id];
            const etiqueta = aplicaMayor(p, qty) ? ' (por mayor)' : '';
            return `• ${qty} x ${p.name}${etiqueta} — ${formatARS(qty * precioAplicado(p, qty))}`;
        });

    const total = productos.reduce((acc, p) => acc + cantidades[p.id] * precioAplicado(p, cantidades[p.id]), 0);

    const partes = [
        '¡Hola NUTLU! Quiero hacer un pedido 🧡',
        '',
        `*Nombre:* ${nombre}`,
        `*Teléfono:* ${telefono}`,
        `*Ciudad/Barrio:* ${ciudad}`,
        '',
        '*Pedido:*',
        ...lineas,
        '',
        `*Total:* ${formatARS(total)}`,
    ];

    if (observaciones) partes.push('', `*Observaciones:* ${observaciones}`);

    return partes.join('\n');
}

/* ---------------- Formulario ---------------- */
function mostrarError(mensaje, campo) {
    const box = document.getElementById('form-error');
    box.textContent = mensaje;
    box.hidden = false;
    if (campo) {
        campo.setAttribute('aria-invalid', 'true');
        campo.focus();
    }
}

function limpiarError() {
    const box = document.getElementById('form-error');
    box.hidden = true;
    box.textContent = '';
    document
        .querySelectorAll('#form-pedido [aria-invalid]')
        .forEach((el) => el.removeAttribute('aria-invalid'));
}

function onSubmit(event) {
    event.preventDefault();
    limpiarError();

    const form = event.currentTarget;
    const nombre = form.nombre.value.trim();
    const telefono = form.telefono.value.trim();
    const ciudad = form.ciudad.value.trim();
    const observaciones = form.observaciones.value.trim();

    if (!nombre) return mostrarError('Necesitamos tu nombre para el pedido.', form.nombre);
    if (!telefono) return mostrarError('Dejanos un teléfono de contacto.', form.telefono);
    if (!ciudad) return mostrarError('Contanos tu ciudad o barrio para la entrega.', form.ciudad);

    const unidades = productos.reduce((acc, p) => acc + cantidades[p.id], 0);
    if (unidades === 0) {
        return mostrarError(
            'Agregá al menos un producto al pedido.',
            document.querySelector('.stepper__qty')
        );
    }

    const texto = armarMensaje({ nombre, telefono, ciudad, observaciones });
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(texto)}`, '_blank');
}

/* ---------------- Carrusel de ingredientes ---------------- */
function conectarCarrusel() {
    const track = document.getElementById('lista-ingredientes');
    const dots = Array.from(document.querySelectorAll('#ingredientes-dots .dot'));
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const slides = () => Array.from(track.querySelectorAll('.slide'));

    /** índice del slide más cercano al borde izquierdo del track */
    const indiceActual = () => {
        let cercano = 0;
        let dist = Infinity;
        slides().forEach((s, i) => {
            const d = Math.abs(s.offsetLeft - track.scrollLeft);
            if (d < dist) {
                dist = d;
                cercano = i;
            }
        });
        return cercano;
    };

    const marcarActivo = (actual) => {
        dots.forEach((d, i) => {
            if (i === actual) d.setAttribute('aria-current', 'true');
            else d.removeAttribute('aria-current');
        });
    };

    /** navega circularmente: del último vuelve al primero */
    const irA = (i) => {
        const items = slides();
        if (!items.length) return;
        const indice = ((i % items.length) + items.length) % items.length;
        track.scrollTo({ left: items[indice].offsetLeft, behavior: suave ? 'smooth' : 'auto' });
        marcarActivo(indice);
    };

    /** para el scroll manual (swipe / rueda): el punto sigue a la posición real */
    const sincronizar = () => marcarActivo(indiceActual());

    document
        .querySelector('[data-carousel="prev"]')
        .addEventListener('click', () => irA(indiceActual() - 1));
    document
        .querySelector('[data-carousel="next"]')
        .addEventListener('click', () => irA(indiceActual() + 1));

    dots.forEach((d) => d.addEventListener('click', () => irA(Number(d.dataset.dot))));

    track.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        irA(indiceActual() + (e.key === 'ArrowRight' ? 1 : -1));
    });

    track.addEventListener('scroll', sincronizar, { passive: true });
    window.addEventListener('resize', sincronizar);

    sincronizar();
}

/* ---------------- Eventos ---------------- */
function conectarEventos() {
    document.getElementById('grid-productos').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pedir]');
        if (!btn) return;
        const id = btn.dataset.pedir;
        setCantidad(id, cantidades[id] + 1);
        limpiarError();
        document.getElementById('contacto').scrollIntoView({ behavior: 'smooth' });
    });

    const lista = document.getElementById('lista-pedido');

    lista.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        setCantidad(id, cantidades[id] + (action === 'inc' ? 1 : -1));
        limpiarError();
    });

    lista.addEventListener('input', (e) => {
        const input = e.target.closest('[data-qty]');
        if (!input) return;
        setCantidad(input.dataset.qty, input.value);
        limpiarError();
    });

    document.getElementById('form-pedido').addEventListener('submit', onSubmit);

    conectarCarrusel();
}

/* ---------------- Header ---------------- */
/* el header sticky cambia de alto según el breakpoint (en mobile apila logo y nav):
   publicamos su alto real en --header-h para que el scroll-margin de las secciones
   deje los títulos visibles al saltar desde el nav */
function ajustarAltoHeader() {
    const alto = document.querySelector('.site-header').offsetHeight;
    document.documentElement.style.setProperty('--header-h', `${alto}px`);
}

/* ---------------- Init ---------------- */
function mostrarAvisoCarga() {
    const aviso = '<p class="aviso">No pudimos cargar los productos. Actualizá la página en un momento.</p>';
    ['grid-productos', 'lista-ingredientes', 'lista-pedido'].forEach((id) => {
        document.getElementById(id).innerHTML = aviso;
    });
    document.querySelector('.btn--whatsapp').disabled = true;
    document.querySelector('.carousel__controls').hidden = true;
}

async function init() {
    try {
        const res = await fetch('./products.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        productos = data.map((p) => ({
            ...p,
            id: slug(p.name),
            precioNum: parsePrecio(p.price),
            precioMayorNum: parsePrecio(p.wholesale_price),
            ingredientes: Array.isArray(p.ingredientes) ? p.ingredientes : [],
        }));
        productos.forEach((p) => {
            cantidades[p.id] = 0;
        });

        renderProductos();
        renderIngredientes();
        renderPedido();
        actualizarTotales();
        conectarEventos();

        ajustarAltoHeader();
        window.addEventListener('resize', ajustarAltoHeader);
        window.addEventListener('load', ajustarAltoHeader);
    } catch (error) {
        console.error(
            'No se pudo cargar products.json. Servir el sitio por HTTP (ej. python3 -m http.server 8000 --directory src); con file:// el fetch se bloquea por CORS.',
            error
        );
        mostrarAvisoCarga();
    }
}

document.addEventListener('DOMContentLoaded', init);
