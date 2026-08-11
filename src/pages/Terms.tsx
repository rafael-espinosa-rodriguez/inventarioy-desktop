import { Link } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
import InventarioYLogo from '../components/InventarioYLogo';

export default function Terms() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            to="/register"
            className="p-2 -ml-2 rounded-lg hover:bg-bg transition-colors text-text-secondary hover:text-text"
            aria-label="Volver al registro"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <InventarioYLogo className="h-7" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center gap-3 mb-8">
          <Scale className="w-7 h-7 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold">Términos y Condiciones</h1>
        </div>
        <p className="text-text-secondary text-sm mb-8">
          Última actualización: Julio 2026
        </p>

        <div className="space-y-8 text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-text mb-3">1. Aceptación de los Términos</h2>
            <p>
              Al instalar, configurar y utilizar InventarioY, usted acepta estos Términos y Condiciones en su totalidad. Si no está de acuerdo con alguna parte de estos términos, no debe utilizar la aplicación.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">2. Descripción del Producto</h2>
            <p>
              InventarioY es una aplicación de escritorio de gestión empresarial que permite administrar inventarios, registrar ventas, gestionar recetas, controlar cuentas por cobrar y generar reportes. Todos sus datos se almacenan de forma local en su equipo y la aplicación funciona sin conexión a internet.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">3. Configuración del Negocio y PIN</h2>
            <p>
              Al configurar InventarioY, usted registra el nombre de su negocio y crea un PIN de acceso. Todos los datos quedan guardados localmente en su equipo. Usted es responsable de mantener la confidencialidad de sus PINs y de todas las actividades que ocurran bajo su cuenta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">4. Período de Prueba Gratis</h2>
            <p>
              Al configurar la aplicación, se le otorgan 7 (siete) días de prueba gratuita con acceso completo a todas las funcionalidades. Al finalizar el período de prueba, deberá activar el Plan Profesional para continuar utilizando el servicio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">5. Plan Profesional, Pago y Activación</h2>
            <p>
              El Plan Profesional tiene un costo de 5,000 CUP al mes por negocio. La adquisición se realiza de forma manual: contacte a nuestro equipo, realice el pago (efectivo o transferencia) y reciba una clave de activación. La clave se introduce en la aplicación y activa la licencia por el período contratado (1, 3, 6 o 12 meses, con descuento en planes de mayor duración). La renovación es igualmente manual al vencer la licencia. InventarioY se reserva el derecho de modificar los precios con previo aviso.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">6. Uso Permitido</h2>
            <p>
              Usted se compromete a utilizar InventarioY únicamente para fines lícitos y de acuerdo con estos términos. Está prohibido: usar la aplicación para actividades ilegales, intentar acceder sin autorización a los PINs ajenos, realizar ingeniería inversa sobre el software, o cualquier uso que pueda dañar o deteriorar el producto. La manipulación de la fecha del sistema para evadir el control de la licencia está expresamente prohibida y puede derivar en la suspensión del acceso.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">7. Almacenamiento y Respaldo de Datos</h2>
            <p>
              Los datos de su negocio se almacenan exclusivamente en la base de datos local de su equipo. Le recomendamos realizar copias de seguridad periódicas. InventarioY no se hace responsable por la pérdida de datos causada por fallos del equipo, borrado accidental o falta de respaldo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">8. Limitación de Responsabilidad</h2>
            <p>
              En la máxima medida permitida por la ley aplicable, InventarioY no será responsable por daños directos, indirectos, incidentales o consecuentes que resulten del uso o la imposibilidad de usar la aplicación, incluyendo pérdida de datos, pérdida de ingresos o interrupción del negocio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">9. Privacidad de los Datos</h2>
            <p>
              El manejo de sus datos personales se rige por nuestra{' '}
              <Link to="/privacy" className="text-primary hover:underline">Política de Privacidad</Link>, la cual forma parte integral de estos términos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">10. Vencimiento y Suspensión de la Licencia</h2>
            <p>
              Cuando la licencia vence, la aplicación pasa a un modo de solo lectura: puede consultar sus datos pero no registrar nuevas operaciones hasta activar una nueva clave de licencia. No se realizan reembolsos por períodos parciales.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">11. Modificaciones de los Términos</h2>
            <p>
              InventarioY se reserva el derecho de modificar estos términos en cualquier momento. Las modificaciones entrarán en vigor al ser publicadas en la aplicación. El uso continuado del producto después de dichas modificaciones constituye la aceptación de los nuevos términos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">12. Contacto</h2>
            <p>
              Para cualquier consulta sobre estos términos, puede contactarnos a través de:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>WhatsApp:{' '}
                <a href="https://wa.me/5354523884" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  +53 54523884
                </a>
              </li>
              <li>Correo electrónico:{' '}
                <a href="mailto:nikko6357@gmail.com" className="text-primary hover:underline">
                  nikko6357@gmail.com
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al registro
          </Link>
        </div>
      </main>
    </div>
  );
}
