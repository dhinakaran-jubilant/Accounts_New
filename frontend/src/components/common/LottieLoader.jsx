import React, { useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const REMOTE_URL = 'https://lottie.host/12a145fc-c53e-4932-81d8-1d310a3cc8f0/IzI2s6UDyF.lottie';
const LOCAL_URL = '/loading.lottie';

/**
 * LottieLoader Component
 * Renders the official requested DotLottie animation (https://lottie.host/12a145fc-c53e-4932-81d8-1d310a3cc8f0/IzI2s6UDyF.lottie)
 * with graceful sizing, fallback, and optional caption.
 *
 * @param {Object} props
 * @param {'xs'|'sm'|'md'|'lg'|'xl'|number} [props.size='md'] - Dimensions in pixels or preset size
 * @param {string} [props.text] - Optional loading message below the animation
 * @param {string} [props.className] - Optional container wrapper classes
 * @param {boolean} [props.fullPage=false] - If true, renders a centered full-screen/page overlay
 * @param {boolean} [props.inline=false] - If true, renders inline without extra padding
 */
export default function LottieLoader({
	size = 'md',
	text = 'Loading...',
	className = '',
	fullPage = false,
	inline = false,
}) {
	const [activeSrc, setActiveSrc] = useState(REMOTE_URL);
	const [hasError, setHasError] = useState(false);

	let pixelSize = 72;
	if (typeof size === 'number') {
		pixelSize = size;
	} else {
		switch (size) {
			case 'xs':
				pixelSize = 32;
				break;
			case 'sm':
				pixelSize = 48;
				break;
			case 'md':
				pixelSize = 72;
				break;
			case 'lg':
				pixelSize = 100;
				break;
			case 'xl':
				pixelSize = 140;
				break;
			default:
				pixelSize = 72;
		}
	}

	const handleDotLottieRef = (dotLottie) => {
		if (!dotLottie) return;
		dotLottie.addEventListener('loadError', () => {
			if (activeSrc === REMOTE_URL) {
				// Fallback to local copy in public folder
				setActiveSrc(LOCAL_URL);
			} else {
				setHasError(true);
			}
		});
	};

	const loaderContent = (
		<div
			className={`flex flex-col items-center justify-center select-none ${
				inline ? '' : 'py-8 px-4'
			} ${className}`}
		>
			<div
				style={{
					width: `${pixelSize}px`,
					height: `${pixelSize}px`,
					minWidth: `${pixelSize}px`,
					minHeight: `${pixelSize}px`,
				}}
				className="flex items-center justify-center overflow-hidden"
			>
				{!hasError ? (
					<DotLottieReact
						src={activeSrc}
						loop
						autoplay
						dotLottieRefCallback={handleDotLottieRef}
						style={{ width: '100%', height: '100%' }}
					/>
				) : (
					<div
						className="border-3 border-primary/20 border-t-primary rounded-full animate-spin"
						style={{ width: `${Math.min(pixelSize, 40)}px`, height: `${Math.min(pixelSize, 40)}px` }}
					/>
				)}
			</div>
			{text && (
				<p className="text-xs font-bold text-slate-500 mt-2.5 tracking-tight text-center">
					{text}
				</p>
			)}
		</div>
	);

	if (fullPage) {
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm animate-in fade-in duration-200">
				{loaderContent}
			</div>
		);
	}

	return loaderContent;
}

/**
 * TableLoader Component
 * Renders a full-width table row loader containing the Lottie animation
 */
export function TableLoader({ colSpan = 7, text = 'Loading data...', size = 'md', className = '' }) {
	return (
		<tr>
			<td colSpan={colSpan} className={`py-12 text-center ${className}`}>
				<LottieLoader text={text} size={size} />
			</td>
		</tr>
	);
}
