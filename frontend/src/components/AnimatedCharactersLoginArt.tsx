import { useEffect, useRef, useState, type RefObject } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";

type AnimatedCharactersLoginArtProps = {
  focusPulse: number;
  isFieldFocused: boolean;
  isPasswordVisible: boolean;
  hasPassword: boolean;
};

type PupilProps = {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
};

type EyeBallProps = {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
};

function Pupil({
  size = 12,
  maxDistance = 5,
  pupilColor = "#23364f",
  forceLookX,
  forceLookY,
}: PupilProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      setMouse({ x: event.clientX, y: event.clientY });
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  function calculatePupilPosition() {
    if (!pupilRef.current) {
      return { x: 0, y: 0 };
    }

    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }

    const rect = pupilRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = mouse.x - centerX;
    const deltaY = mouse.y - centerY;
    const distance = Math.min(Math.hypot(deltaX, deltaY), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  }

  const position = calculatePupilPosition();

  return (
    <div
      ref={pupilRef}
      className="login-art-pupil"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    />
  );
}

function EyeBall({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = "#ffffff",
  pupilColor = "#23364f",
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      setMouse({ x: event.clientX, y: event.clientY });
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  function calculatePupilPosition() {
    if (!eyeRef.current) {
      return { x: 0, y: 0 };
    }

    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }

    const rect = eyeRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = mouse.x - centerX;
    const deltaY = mouse.y - centerY;
    const distance = Math.min(Math.hypot(deltaX, deltaY), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  }

  const position = calculatePupilPosition();

  return (
    <div
      ref={eyeRef}
      className="login-art-eye"
      style={{
        width: `${size}px`,
        height: isBlinking ? "2px" : `${size}px`,
        backgroundColor: eyeColor,
      }}
    >
      {!isBlinking ? (
        <div
          className="login-art-eye-pupil"
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            transform: `translate(${position.x}px, ${position.y}px)`,
          }}
        />
      ) : null}
    </div>
  );
}

function getCharacterMotion(ref: RefObject<HTMLDivElement>, mouseX: number, mouseY: number) {
  if (!ref.current) {
    return { faceX: 0, faceY: 0, bodySkew: 0 };
  }

  const rect = ref.current.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 3;
  const deltaX = mouseX - centerX;
  const deltaY = mouseY - centerY;

  return {
    faceX: Math.max(-15, Math.min(15, deltaX / 20)),
    faceY: Math.max(-10, Math.min(10, deltaY / 30)),
    bodySkew: Math.max(-6, Math.min(6, -deltaX / 120)),
  };
}

export function AnimatedCharactersLoginArt({
  focusPulse,
  isFieldFocused,
  isPasswordVisible,
  hasPassword,
}: AnimatedCharactersLoginArtProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [purpleBlinking, setPurpleBlinking] = useState(false);
  const [blackBlinking, setBlackBlinking] = useState(false);
  const [charactersLookingAtEachOther, setCharactersLookingAtEachOther] = useState(false);
  const [purplePeeking, setPurplePeeking] = useState(false);

  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      setMouse({ x: event.clientX, y: event.clientY });
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    function scheduleBlink(setter: (value: boolean) => void) {
      let timerId = 0;
      let frameId = 0;

      function queueNextBlink() {
        timerId = window.setTimeout(() => {
          setter(true);
          frameId = window.setTimeout(() => {
            setter(false);
            queueNextBlink();
          }, 150);
        }, Math.random() * 4000 + 3000);
      }

      queueNextBlink();

      return () => {
        window.clearTimeout(timerId);
        window.clearTimeout(frameId);
      };
    }

    const clearPurple = scheduleBlink(setPurpleBlinking);
    const clearBlack = scheduleBlink(setBlackBlinking);

    return () => {
      clearPurple();
      clearBlack();
    };
  }, []);

  useEffect(() => {
    if (!focusPulse) {
      return;
    }

    setCharactersLookingAtEachOther(true);
    const timerId = window.setTimeout(() => setCharactersLookingAtEachOther(false), 900);
    return () => window.clearTimeout(timerId);
  }, [focusPulse]);

  useEffect(() => {
    if (!(hasPassword && isPasswordVisible)) {
      setPurplePeeking(false);
      return;
    }

    let intervalId = 0;
    let peekTimeoutId = 0;

    function queuePeek() {
      intervalId = window.setTimeout(() => {
        setPurplePeeking(true);
        peekTimeoutId = window.setTimeout(() => {
          setPurplePeeking(false);
          queuePeek();
        }, 760);
      }, Math.random() * 2800 + 1800);
    }

    queuePeek();

    return () => {
      window.clearTimeout(intervalId);
      window.clearTimeout(peekTimeoutId);
      setPurplePeeking(false);
    };
  }, [hasPassword, isPasswordVisible]);

  const purpleMotion = getCharacterMotion(purpleRef, mouse.x, mouse.y);
  const blackMotion = getCharacterMotion(blackRef, mouse.x, mouse.y);
  const yellowMotion = getCharacterMotion(yellowRef, mouse.x, mouse.y);
  const orangeMotion = getCharacterMotion(orangeRef, mouse.x, mouse.y);

  return (
    <section className="login-art-shell" aria-hidden="true">
      <div className="login-art-brand">
        <span className="login-art-brand-badge">
          <Sparkles size={16} strokeWidth={2.1} />
          智能运维平台
        </span>
        <div className="login-art-heading">
          <h2>统一接入</h2>
          <p>
            以统一入口承载资产视图、任务协同与执行留痕，
            <br />
            帮助团队在稳定秩序中完成日常运维工作。
          </p>
        </div>
      </div>

      <div className="login-art-stage">
        <div className="login-art-grid" />
        <div className="login-art-glow login-art-glow-one" />
        <div className="login-art-glow login-art-glow-two" />

        <div className="login-art-figure">
          <div
            ref={purpleRef}
            className="login-art-character login-art-character-purple"
            style={{
              height: isFieldFocused || (hasPassword && !isPasswordVisible) ? "440px" : "400px",
              transform:
                hasPassword && isPasswordVisible
                  ? "skewX(0deg)"
                  : isFieldFocused || (hasPassword && !isPasswordVisible)
                    ? `skewX(${purpleMotion.bodySkew - 12}deg) translateX(40px)`
                    : `skewX(${purpleMotion.bodySkew}deg)`,
            }}
          >
            <div
              className="login-art-eyes"
              style={{
                left:
                  hasPassword && isPasswordVisible
                    ? "20px"
                    : charactersLookingAtEachOther
                      ? "56px"
                      : `${45 + purpleMotion.faceX}px`,
                top:
                  hasPassword && isPasswordVisible
                    ? "36px"
                    : charactersLookingAtEachOther
                      ? "64px"
                      : `${40 + purpleMotion.faceY}px`,
              }}
            >
              <EyeBall
                size={18}
                pupilSize={7}
                maxDistance={5}
                isBlinking={purpleBlinking}
                forceLookX={
                  hasPassword && isPasswordVisible
                    ? purplePeeking
                      ? 4
                      : -4
                    : charactersLookingAtEachOther
                      ? 3
                      : undefined
                }
                forceLookY={
                  hasPassword && isPasswordVisible
                    ? purplePeeking
                      ? 5
                      : -4
                    : charactersLookingAtEachOther
                      ? 4
                      : undefined
                }
              />
              <EyeBall
                size={18}
                pupilSize={7}
                maxDistance={5}
                isBlinking={purpleBlinking}
                forceLookX={
                  hasPassword && isPasswordVisible
                    ? purplePeeking
                      ? 4
                      : -4
                    : charactersLookingAtEachOther
                      ? 3
                      : undefined
                }
                forceLookY={
                  hasPassword && isPasswordVisible
                    ? purplePeeking
                      ? 5
                      : -4
                    : charactersLookingAtEachOther
                      ? 4
                      : undefined
                }
              />
            </div>
          </div>

          <div
            ref={blackRef}
            className="login-art-character login-art-character-black"
            style={{
              transform:
                hasPassword && isPasswordVisible
                  ? "skewX(0deg)"
                  : charactersLookingAtEachOther
                    ? `skewX(${blackMotion.bodySkew * 1.5 + 10}deg) translateX(20px)`
                    : isFieldFocused || (hasPassword && !isPasswordVisible)
                      ? `skewX(${blackMotion.bodySkew * 1.5}deg)`
                      : `skewX(${blackMotion.bodySkew}deg)`,
            }}
          >
            <div
              className="login-art-eyes login-art-eyes-black"
              style={{
                left:
                  hasPassword && isPasswordVisible
                    ? "10px"
                    : charactersLookingAtEachOther
                      ? "32px"
                      : `${26 + blackMotion.faceX}px`,
                top:
                  hasPassword && isPasswordVisible
                    ? "28px"
                    : charactersLookingAtEachOther
                      ? "12px"
                      : `${32 + blackMotion.faceY}px`,
              }}
            >
              <EyeBall
                size={16}
                pupilSize={6}
                maxDistance={4}
                isBlinking={blackBlinking}
                forceLookX={hasPassword && isPasswordVisible ? -4 : charactersLookingAtEachOther ? 0 : undefined}
                forceLookY={hasPassword && isPasswordVisible ? -4 : charactersLookingAtEachOther ? -4 : undefined}
              />
              <EyeBall
                size={16}
                pupilSize={6}
                maxDistance={4}
                isBlinking={blackBlinking}
                forceLookX={hasPassword && isPasswordVisible ? -4 : charactersLookingAtEachOther ? 0 : undefined}
                forceLookY={hasPassword && isPasswordVisible ? -4 : charactersLookingAtEachOther ? -4 : undefined}
              />
            </div>
          </div>

          <div
            ref={orangeRef}
            className="login-art-character login-art-character-orange"
            style={{
              transform: hasPassword && isPasswordVisible ? "skewX(0deg)" : `skewX(${orangeMotion.bodySkew}deg)`,
            }}
          >
            <div
              className="login-art-pupil-row"
              style={{
                left: hasPassword && isPasswordVisible ? "50px" : `${82 + orangeMotion.faceX}px`,
                top: hasPassword && isPasswordVisible ? "85px" : `${90 + orangeMotion.faceY}px`,
              }}
            >
              <Pupil
                size={12}
                maxDistance={5}
                forceLookX={hasPassword && isPasswordVisible ? -5 : undefined}
                forceLookY={hasPassword && isPasswordVisible ? -4 : undefined}
              />
              <Pupil
                size={12}
                maxDistance={5}
                forceLookX={hasPassword && isPasswordVisible ? -5 : undefined}
                forceLookY={hasPassword && isPasswordVisible ? -4 : undefined}
              />
            </div>
          </div>

          <div
            ref={yellowRef}
            className="login-art-character login-art-character-yellow"
            style={{
              transform: hasPassword && isPasswordVisible ? "skewX(0deg)" : `skewX(${yellowMotion.bodySkew}deg)`,
            }}
          >
            <div
              className="login-art-pupil-row login-art-pupil-row-yellow"
              style={{
                left: hasPassword && isPasswordVisible ? "20px" : `${52 + yellowMotion.faceX}px`,
                top: hasPassword && isPasswordVisible ? "35px" : `${40 + yellowMotion.faceY}px`,
              }}
            >
              <Pupil
                size={12}
                maxDistance={5}
                forceLookX={hasPassword && isPasswordVisible ? -5 : undefined}
                forceLookY={hasPassword && isPasswordVisible ? -4 : undefined}
              />
              <Pupil
                size={12}
                maxDistance={5}
                forceLookX={hasPassword && isPasswordVisible ? -5 : undefined}
                forceLookY={hasPassword && isPasswordVisible ? -4 : undefined}
              />
            </div>
            <div
              className="login-art-mouth"
              style={{
                left: hasPassword && isPasswordVisible ? "10px" : `${40 + yellowMotion.faceX}px`,
                top: hasPassword && isPasswordVisible ? "88px" : `${88 + yellowMotion.faceY}px`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="login-art-footnotes">
        <span>
          <ShieldCheck size={14} strokeWidth={2.2} />
          身份校验
        </span>
        <span>资产视图</span>
        <span>任务闭环</span>
      </div>
    </section>
  );
}
