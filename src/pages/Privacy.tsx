import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import InventarioYLogo from '../components/InventarioYLogo';

export default function Privacy() {
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
          <Shield className="w-7 h-7 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold">Política de Privacidad</h1>
        </div>
        <p className="text-text-secondary text-sm mb-8">
          Última actualización: Julio 2026
        </p>

        <div className="space-y-8 text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-text mb-3">1. Introducción</h2>
            <p>
              En InventarioY valoramos su privacidad. Esta Política de Privacidad describe cómo manejamos su información cuando utiliza nuestra aplicación de escritorio, que funciona de forma local y sin conexión a internet.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">2. Datos que Almacenamos</h2>
            <p>Al configurar y utilizar InventarioY, se almacenan los siguientes datos:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong className="text-text">Datos de negocio:</strong> nombre del negocio, PINs de acceso y datos de contacto que usted registre.</li>
              <li><strong className="text-text">Datos operativos:</strong> productos, inventario, ventas, recetas, movimientos de almacén, cuentas por cobrar, nómina y registros de actividad generados por el uso de la aplicación.</li>
              <li><strong className="text-text">Datos de licencia:</strong> fecha de inicio de la prueba, clave de activación y fechas de vencimiento de la licencia.</li>
            </ul>
            <p className="mt-3">
              Todos estos datos se almacenan exclusivamente en la base de datos local de su equipo. InventarioY no recopila ni transmite sus datos a servidores externos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">3. Finalidad del Tratamiento</h2>
            <p>Sus datos se utilizan exclusivamente para los siguientes fines:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Proveer la gestión de su negocio (inventario, ventas, recetas).</li>
              <li>Validar la autenticación mediante PINs de acceso.</li>
              <li>Controlar el estado de la licencia y el período de prueba.</li>
              <li>Brindar soporte técnico y atención al cliente cuando usted lo solicite.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">4. Almacenamiento de los Datos</h2>
            <p>
              Sus datos se guardan en una base de datos local (SQLite) dentro de su equipo, en la carpeta de datos de la aplicación. No se transmiten a internet ni se almacenan en la nube.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">5. No Compartimos sus Datos</h2>
            <p>
              InventarioY no vende, alquila ni comparte sus datos con terceros para fines comerciales o publicitarios. Sus datos solo son accesibles por usted y, cuando usted lo autorice explícitamente, por los empleados que usted registre en la aplicación para gestionar su negocio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">6. Seguridad de los Datos</h2>
            <p>
              Sus datos permanecen en su equipo y no salen de él. Le recomendamos proteger su equipo con una contraseña de usuario y realizar copias de seguridad periódicas de la carpeta de datos de la aplicación.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">7. Conservación de los Datos</h2>
            <p>
              Sus datos se conservan en su equipo mientras la aplicación esté instalada. Al desinstalar o eliminar la aplicación, los datos asociados se eliminan de su equipo. Puede realizar una copia de respaldo en cualquier momento si lo desea.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">8. Sus Derechos</h2>
            <p>
              Usted tiene derecho a:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Acceder a sus datos personales almacenados en la aplicación.</li>
              <li>Solicitar la corrección de datos inexactos.</li>
              <li>Solicitar la exportación de sus datos en un formato legible.</li>
              <li>Solicitar la eliminación de su negocio y todos los datos asociados.</li>
            </ul>
            <p className="mt-3">
              Para ejercer cualquiera de estos derechos, contáctenos a través de los canales indicados en la sección de contacto.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">9. Cookies y Almacenamiento Local</h2>
            <p>
              InventarioY no utiliza cookies ni tecnologías de seguimiento. La aplicación utiliza únicamente el almacenamiento local de su equipo para recordar su sesión y preferencias. No hay publicidad ni seguimiento de terceros.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">10. Menores de Edad</h2>
            <p>
              InventarioY está dirigido a mayores de 18 años (dueños de negocios). No recopilamos intencionalmente datos de menores. Si tiene conocimiento de que un menor ha proporcionado datos personales, contáctenos para proceder a su eliminación.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">11. Cambios en esta Política</h2>
            <p>
              Podemos actualizar esta Política de Privacidad ocasionalmente. La fecha de última actualización se indica al inicio de este documento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-3">12. Contacto</h2>
            <p>
              Si tiene preguntas sobre esta Política de Privacidad o desea ejercer sus derechos, contáctenos:
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
