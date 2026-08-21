// Point this at either a local file in `public/videos/` or any hosted URL
// (S3, Cloudinary, YouTube-hosted mp4, government CDN, etc.)
export const heroVideo = {
  // Local example: "/videos/sikkim-hero.mp4"
  // URL example:   "https://your-cdn.example.com/sikkim-hero.mp4"
  src: "https://res.cloudinary.com/b2qszshm/video/upload/v1787164474/4K_Cinematic_Drone_Video_of_Sikkim_India_Nature_Himalayas_-_Walk_n_Talk_1080p_h264_youtube_g3hxbp.mp4",
  // Cloudinary generates this still from the same video. Change `so_3` to
  // `so_5`, `so_8`, etc. to choose a different second from the footage.
  poster: "https://res.cloudinary.com/b2qszshm/video/upload/so_3,f_auto,q_auto/v1787164474/4K_Cinematic_Drone_Video_of_Sikkim_India_Nature_Himalayas_-_Walk_n_Talk_1080p_h264_youtube_g3hxbp.jpg",
};
