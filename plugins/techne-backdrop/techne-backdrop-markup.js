/* Techne backdrop markup (synced from ~/Dev/my-website/index.html)
   Update via: ./scripts/sync-techne-backdrop-from-website.sh
*/

window.TECHNE_BACKDROP_LAYERS_HTML = `
  <!-- LAYER 4: Shapes -->
  <div class="shapes-layer" id="shapesLayer">
    <!-- Large blocks -->
    <div class="shape block-red" style="width: 100px; height: 100px; top: 55%; right: 3%;" data-parallax="0.12" data-rotation="15"></div>
    <div class="shape outline" style="width: 350px; height: 350px; top: 35%; left: 8%;" data-parallax="0.04" data-rotation="-5"></div>
    <div class="shape outline-red" style="width: 180px; height: 180px; top: 68%; right: 18%;" data-parallax="0.1" data-rotation="20"></div>
    
    <!-- Glass shapes -->
    <div class="shape glass" style="width: 200px; height: 120px; top: 22%; right: 25%;" data-parallax="0.08"></div>
    <div class="shape glass-red" style="width: 150px; height: 200px; top: 50%; left: 12%;" data-parallax="0.14" data-rotation="8"></div>
    
    <!-- Lines -->
    <div class="shape line" style="width: 500px; top: 18%; left: 15%;" data-parallax="0.09" data-rotation="-25"></div>
    <div class="shape line-red" style="width: 350px; top: 48%; right: 5%;" data-parallax="0.16" data-rotation="30"></div>
    <div class="shape line-thin" style="width: 600px; top: 75%; left: 0;" data-parallax="0.07" data-rotation="-10"></div>
    
    <!-- Crosses -->
    <div class="shape cross" style="width: 80px; height: 80px; top: 15%; right: 35%; color: var(--black);" data-parallax="0.13"></div>
    <div class="shape cross" style="width: 50px; height: 50px; top: 70%; left: 30%; color: var(--red);" data-parallax="0.2"></div>
    
    <!-- Small blocks -->
    <div class="shape block" style="width: 25px; height: 25px; top: 40%; left: 45%;" data-parallax="0.22" data-rotation="45"></div>
    <div class="shape block-red" style="width: 18px; height: 18px; top: 28%; right: 42%;" data-parallax="0.28"></div>
    <div class="shape block" style="width: 30px; height: 30px; top: 82%; left: 55%;" data-parallax="0.25" data-rotation="30"></div>
    <div class="shape block-white" style="width: 40px; height: 40px; top: 62%; left: 38%;" data-parallax="0.18" data-rotation="12"></div>
    
    <!-- Circles -->
    <div class="shape circle-outline" style="width: 200px; height: 200px; top: 45%; right: 30%;" data-parallax="0.11"></div>
    <div class="shape block-red circle" style="width: 30px; height: 30px; top: 32%; left: 28%;" data-parallax="0.24"></div>
  </div>


  <!-- LAYER 7: Rotating shapes -->
  <div class="rotating-shapes-layer">
    <div class="rotating-shape shape-1" id="shape1"></div>
    <div class="rotating-shape shape-2" id="shape2"></div>
    <div class="rotating-shape shape-3" id="shape3"></div>
    <div class="rotating-shape shape-4" id="shape4"></div>
    <div class="rotating-shape shape-5" id="shape5"></div>
    <div class="rotating-shape shape-6" id="shape6"></div>
  </div>


  <!-- LAYER 8: Fauna overlay -->
  <div id="fauna-overlay">
    <canvas id="fauna-canvas"></canvas>
  </div>

`;

