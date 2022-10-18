import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as dat from "dat.gui";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
// import { PlayerControls } from "./PlayerControls.js";

/**
 * Base
 */
/**
 * Global Variables & Constants
 */
let model, player;
let CharacterAnimations = {};
let mixer = null;

// Debug
const gui = new dat.GUI();

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

const textureLoader = new THREE.TextureLoader();

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/**
 * Returns The Loaded animations from the
 * Character Animation Object
 */
class CharacterAnimationMapProxy {
  constructor(animations) {
    this._animations = animations;
  }

  get animations() {
    return this._animations;
  }
}

class FiniteStateMachine {
  constructor() {
    this._states = {};
    this._currentState = null;
  }

  _AddState(name, type) {
    this._states[name] = type;
  }

  SetState(name) {
    const prevState = this._currentState;

    if (prevState) {
      if (prevState.Name == name) {
        return;
      }
      prevState.Exit();
    }

    const state = new this._states[name](this);

    this._currentState = state;
    state.Enter(prevState);
  }

  Update(timeElapsed, input) {
    if (this._currentState) {
      this._currentState.Update(timeElapsed, input);
    }
  }
}

class CharacterFSM extends FiniteStateMachine {
  constructor(proxy) {
    super();
    this._proxy = proxy;
    this._Init();
  }

  _Init() {
    this._AddState("idle", IdleState);
    this._AddState("walk", WalkState);
    this._AddState("walkback", WalkBackState);
    this._AddState("run", RunState);
    this._AddState("jump", JumpState);
  }
}

class State {
  constructor(parent) {
    this._parent = parent;
  }

  Enter() {}
  Exit() {}
  Update() {}
}

/**
 * Sizes
 */
 const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};


/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.01,
  1000
);


    const cameraOffset = new THREE.Vector3(0.0, 1.9, 3.0); // NOTE Constant offset between the camera and the target

     // NOTE Assuming the camera is direct child of the Scene
    const objectPosition = new THREE.Vector3();

// camera.position.set(2, 2, 2);
     scene.add(camera);

class CharacterController {
  constructor() {
    // params: {camera, scene}
    this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
    this._acceleration = new THREE.Vector3(1, 0.25, 8.0);
    this._velocity = new THREE.Vector3(0, 0, 0);
    this._animations = {};
    this._input = new CharacterControllerKeyboardInput();
    this._stateMachine = new CharacterFSM(
      new CharacterAnimationMapProxy(this._animations)
    );

    this._LoadModels();
  }

  _LoadModels() {
    gltfLoader.load("/models/krtin/krtinRPM.glb", (gltf) => {
      // gltf.scene.scale.set(0.1, 0.1, 0.);
      this._model = gltf.scene;
      this._model.rotation.set(0, Math.PI, 0);
      this._model.position.set(-3.14, 0.1, -3.14);
      this._model.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
        }
      });
  
     
      // camera.lookAt(this._model);
      scene.add(this._model);
      this._mixer = new THREE.AnimationMixer(this._model);
      this._loadingManagert = new THREE.LoadingManager();
      this._loadingManagert.onLoad = () => {
        this._stateMachine.SetState("idle");
      };

      const _OnLoad = (name, obj) => {
        const clip = obj.animations[0];
        const action = this._mixer.clipAction(clip);
        this._animations[name] = {
          clip,
          action,
        };
      };
      const fbxloader = new FBXLoader(this._loadingManagert);
      fbxloader.load("/models/krtin/walk.fbx", (a) => _OnLoad("walk", a));
      fbxloader.load("/models/krtin/walkback.fbx", (a) =>
        _OnLoad("walkback", a)
      );
      fbxloader.load("/models/krtin/Running.fbx", (a) => _OnLoad("run", a));
      fbxloader.load("/models/krtin/jump.fbx", (a) => _OnLoad("jump", a));
      fbxloader.load("/models/krtin/Idle.fbx", (a) => _OnLoad("idle", a));
    });
  }


  Update(timeInSeconds) {
    if (!this._model) return;
    this._stateMachine.Update(timeInSeconds, this._input);
    const velocity = this._velocity;
    const frameDecceleration = new THREE.Vector3(
      velocity.x * this._decceleration.x,
      velocity.y * this._decceleration.y,
      velocity.z * this._decceleration.z
    );
    frameDecceleration.multiplyScalar(timeInSeconds);
    frameDecceleration.z =
      Math.sign(frameDecceleration.z) *
      Math.min(Math.abs(frameDecceleration.z), Math.abs(velocity.z));
    velocity.add(frameDecceleration);
    const controlModel = this._model;
    const _Q = new THREE.Quaternion();
    const _A = new THREE.Vector3();
    const _R = controlModel.quaternion.clone();
    const _CamClone = camera.quaternion.clone();

    const acc = this._acceleration.clone();


    controlModel.getWorldPosition(objectPosition);

    camera.position.copy(objectPosition).add(cameraOffset);

    if (this._input._keys.shift) acc.multiplyScalar(2.0);

    // if (this._stateMachine._currentState.Name == "dance")
    //   acc.multiplyScalar(0.0);

    if (this._input._keys.forward) velocity.z += acc.z * timeInSeconds;

    if (this._input._keys.backward) velocity.z -= acc.z * timeInSeconds;

    if (this._input._keys.left) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(
        _A,
        4.0 * Math.PI * timeInSeconds * this._acceleration.y
      );
      _R.multiply(_Q);
      _CamClone.multiply(_Q);
    }
    if (this._input._keys.right) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(
        _A,
        4.0 * -Math.PI * timeInSeconds * this._acceleration.y
      );
      _R.multiply(_Q);
      _CamClone.multiply(_Q);
    }

    controlModel.quaternion.copy(_R);
    followDude(camera, _CamClone)


    const oldPosition = new THREE.Vector3();
    oldPosition.copy(controlModel.quaternion);

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(controlModel.quaternion);
    forward.normalize();

    const sideways = new THREE.Vector3(1, 0, 0);
    sideways.applyQuaternion(controlModel.quaternion);
    sideways.normalize();

    sideways.multiplyScalar(velocity.x * timeInSeconds);
    forward.multiplyScalar(velocity.z * timeInSeconds);

    controlModel.position.add(forward);
    controlModel.position.add(sideways);

    oldPosition.copy(controlModel.position);

    if (this._mixer) this._mixer.update(timeInSeconds);
  }
}

function followDude(cam, _CamClone){

  cam.quaternion.copy(_CamClone);
  // cam.lookAt()

}

/**
 * Keyboard Input to move the characters
 */

class CharacterControllerKeyboardInput {
  constructor() {
    this._Init();
  }

  _Init() {
    this._keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      space: false,
      shift: false,
    };
    document.addEventListener("keydown", (e) => this._onKeyDown(e), false);
    document.addEventListener("keyup", (e) => this._onKeyUp(e), false);
  }

  _onKeyDown(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = true;
        break;
      case 65: // a
        this._keys.left = true;
        break;
      case 83: // s
        this._keys.backward = true;
        break;
      case 68: // d
        this._keys.right = true;
        break;
      case 32: // SPACE
        this._keys.space = true;
        break;
      case 16: // SHIFT
        this._keys.shift = true;
        break;
    }
  }

  _onKeyUp(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = false;
        break;
      case 65: // a
        this._keys.left = false;
        break;
      case 83: // s
        this._keys.backward = false;
        break;
      case 68: // d
        this._keys.right = false;
        break;
      case 32: // SPACE
        this._keys.space = false;
        break;
      case 16: // SHIFT
        this._keys.shift = false;
        break;
    }
  }
}

class IdleState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return "idle";
  }

  Enter(prevState) {
    const idleAction = this._parent._proxy._animations["idle"].action;

    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      idleAction.time = 0.0;
      idleAction.enabled = true;
      idleAction.setEffectiveTimeScale(1.0);
      idleAction.setEffectiveWeight(1.0);
      idleAction.crossFadeFrom(prevAction, 0.7, true);
    }
    idleAction.play();
  }

  Exit() {}

  Update(_, input) {
    if (input._keys.forward) this._parent.SetState("walk");
    else if (input._keys.backward) this._parent.SetState("walkback");
    else if (input._keys.space) this._parent.SetState("jump");
  }
}

class WalkState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return "walk";
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations["walk"].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      curAction.enabled = true;

      if (prevAction.Name == "run") {
        const ratio =
          curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }
      curAction.crossFadeFrom(prevAction, 0.2, true);
    }
    curAction.play();
  }

  Exit() {}

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) {
      if (input._keys.shift) {
        this._parent.SetState("run");
      }
      return;
    }

    this._parent.SetState("idle");
  }
}

class WalkBackState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return "walkback";
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations["walkback"].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      curAction.enabled = true;

      if (prevAction.Name == "run") {
        const ratio =
          curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }
      curAction.crossFadeFrom(prevAction, 0.2, true);
    }
    curAction.play();
  }

  Exit() {}

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) {
      if (input._keys.shift) {
        this._parent.SetState("run");
      }
      return;
    }

    this._parent.SetState("idle");
  }
}

class RunState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return "run";
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations["run"].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == "walk") {
        const ratio =
          curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
    }
    curAction.play();
  }

  Exit() {}

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) {
      if (!input._keys.shift) {
        this._parent.SetState("walk");
      }
      return;
    }

    this._parent.SetState("idle");
  }
}

class JumpState extends State {
  constructor(parent) {
    super(parent);

    this._FinishedCallback = () => {
      this._Finished();
    };
  }

  get Name() {
    return "jump";
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations["jump"].action;
    const mixer = curAction.getMixer();
    mixer.addEventListener("finished", this._FinishedCallback);

    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.reset();
      curAction.setLoop(THREE.LoopOnce, 1);
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.2, true);
    }
    curAction.play();
  }

  _Finished() {
    this._Cleanup();
    this._parent.SetState("idle");
  }

  _Cleanup() {
    const action = this._parent._proxy._animations["jump"].action;

    action.getMixer().removeEventListener("finished", this._CleanupCallback);
  }

  Exit() {
    this._Cleanup();
  }

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) {
      if (input._keys.shift) {
        this._parent.SetState("run");
      }
      return;
    }

    this._parent.SetState("idle");
  }
}


/**
 * Environment
 */


const loadEnv = () => {

  gltfLoader.load("/models/Rooms/Scifi.glb", (gltf) => {
        // gltf.scene.scale.set(0.1, 0.1, 0.);
        const _model = gltf.scene;
        _model.rotation.set(0, Math.PI, 0);
        _model.traverse((object) => {
          if (object.isMesh) {
            object.castShadow = true;
          }
        });
        scene.add(_model);
    
      });


}

loadEnv();

const RPMcharacter = new CharacterController();

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(-3, 10, -10);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 2;
dirLight.shadow.camera.bottom = -2;
dirLight.shadow.camera.left = -2;
dirLight.shadow.camera.right = 2;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 40;
scene.add(dirLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 5);
hemiLight.position.set(0, 500, 0);
scene.add(hemiLight);

/**
 * Sizes
 */


window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});



/**
 * Third Person Cam
 */

 class ThirdPersonCamera {
  constructor(params) {
    this._params = params;
    this._camera = params.camera;

    this._currentPosition = new THREE.Vector3();
    this._currentLookat = new THREE.Vector3();
  }

  _CalculateIdealOffset() {
    const idealOffset = new THREE.Vector3(-15, 20, -30);
    idealOffset.applyQuaternion(this._params.target.Rotation);
    idealOffset.add(this._params.target.Position);
    return idealOffset;
  }

  _CalculateIdealLookat() {
    const idealLookat = new THREE.Vector3(0, 10, 50);
    idealLookat.applyQuaternion(this._params.target.Rotation);
    idealLookat.add(this._params.target.Position);
    return idealLookat;
  }

  Update(timeElapsed) {
    const idealOffset = this._CalculateIdealOffset();
    const idealLookat = this._CalculateIdealLookat();

    // const t = 0.05;
    // const t = 4.0 * timeElapsed;
    const t = 1.0 - Math.pow(0.001, timeElapsed);

    this._currentPosition.lerp(idealOffset, t);
    this._currentLookat.lerp(idealLookat, t);

    this._camera.position.copy(this._currentPosition);
    this._camera.lookAt(this._currentLookat);
  }
}

function _LerpOverFrames(frames, t) {
  const s = new THREE.Vector3(0, 0, 0);
  const e = new THREE.Vector3(100, 0, 0);
  const c = s.clone();

  for (let i = 0; i < frames; i++) {
    c.lerp(e, t);
  }
  return c;
}

function _TestLerp(t1, t2) {
  const v1 = _LerpOverFrames(100, t1);
  const v2 = _LerpOverFrames(50, t2);
  console.log(v1.x + ' | ' + v2.x);
}

_TestLerp(0.01, 0.01);
_TestLerp(1.0 / 100.0, 1.0 / 50.0);
_TestLerp(1.0 - Math.pow(0.3, 1.0 / 100.0), 
          1.0 - Math.pow(0.3, 1.0 / 50.0));




// Controls
// const controls = new OrbitControls(camera, canvas);
// controls.target.set(0, 0.75, 0);
// controls.enableDamping = true;

const thirdPersonCamera = new ThirdPersonCamera({
  camera: camera,
  // target: RPMcharacter,
});

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  alpha: true,
  antialias: true,
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.physicallyCorrectLights = true;


/**
 * Animate
 */
const clock = new THREE.Clock();
let previousTime = 0;

const tick = () => {
  const elapsedTime = clock.getElapsedTime();
  const deltaTime = elapsedTime - previousTime;
  previousTime = elapsedTime;

  // Model animation
  if (mixer) {
    mixer.update(deltaTime);
  }

  // Update controls
  // controls.update();


  //update Camera

  // thirdPersonCamera.Update(elapsedTime);

  // Render
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);

  if (RPMcharacter) RPMcharacter.Update(deltaTime);
};

tick();
