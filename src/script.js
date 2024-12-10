const clientId = "84191b3766304e57a561c7e04a0a5064";
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

if (code && localStorage.getItem("access_token") != 'undefined' && tokenIsNotExpired()) { 
    const profile = await fetchProfile(localStorage.getItem("access_token"));
    populateUI(profile);
    getFollowedArtists();
} else if (!code) {
    redirectToAuthCodeFlow(clientId);
} else {
    const accessToken = await getAccessToken(clientId, code);
    const profile = await fetchProfile(accessToken);
    populateUI(profile);
    saveToken(accessToken);
}

export async function redirectToAuthCodeFlow(clientId) {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:5173/soporify/");
    params.append("scope", "user-read-private user-read-email user-follow-read user-modify-playback-state");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function generateCodeVerifier(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}


export async function getAccessToken(clientId, code) {
    const verifier = localStorage.getItem("verifier");

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:5173/soporify/");
    params.append("code_verifier", verifier);

    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    const { access_token } = await result.json();
    return access_token;
}

async function fetchProfile(token) {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await result.json();
}

async function populateUI(profile) {
    const artists = await getFollowedArtists()    
    const playlists = await getPlaylists(profile);
 
    if (profile.images[0]) {
        const profileImage = new Image(200, 200);
        profileImage.src = profile.images[0].url;
        const link = document.createElement("a", {href: profile.external_urls.spotify});
        link.setAttribute("href", profile.external_urls.spotify);
        link.setAttribute("id", "profile_link")
        document.getElementById("avatar").appendChild(link);
        document.getElementById("profile_link").appendChild(profileImage);
    }
    document.getElementById("email").innerText = profile.email;
    document.getElementById("playlist_count").innerText = playlists.length;
    document.getElementById("artist_count").innerText = artists.length;

    artists.forEach(artist => {
        const artistElement = document.createElement("li");
        artistElement.classList.add("artist");
        artistElement.innerHTML = `
            <img src="${artist.images[0].url}" alt="${artist.name}" class="artist-img">
            <h3>${artist.name}</h3>
            <a href="${artist.external_urls.spotify}">Voir plus</a>
        `;
        document.getElementById("artists").appendChild(artistElement);
    });

    playlists.forEach(playlist => {
        const playlistElement = document.createElement("li");
        playlistElement.classList.add("playlist");
        playlistElement.innerHTML = `
            ${playlist.images != null ? '<img src="'+ playlist.images[0].url +'" alt="'+ playlist.name + '" class="playlist-img"></img>' : ''}
            <h3>${playlist.name}</h3>
            <button class="playlist-play-btn" data-uri="${playlist.uri}">PLAY</button>
        `;
        document.getElementById("playlists").appendChild(playlistElement);
        document.querySelector(`.playlist-play-btn[data-uri="${playlist.uri}"]`).addEventListener("click", async () => {
            await playPlaylist(playlist.uri);
        });
    });
}

function saveToken(token){
    localStorage.setItem("access_token", token);
    localStorage.setItem("token_expiration", new Date().getTime() + 3600 * 1000); // 1 hour
}

function tokenIsNotExpired(){
    const expiration = parseInt(localStorage.getItem("token_expiration"));
    const now = new Date().getTime();
    return expiration > now;
}

async function getFollowedArtists() {
    const artists = await fetch('https://api.spotify.com/v1/me/following?type=artist', { 
        method: 'GET',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }    },
    ).then(response => response.json());

    return artists.artists.items;
}

async function searchMusic() {
    const searchResultsContainer = document.getElementById("search-results");
    searchResultsContainer.innerHTML = '';

    const searchTerm = document.getElementById("search-input").value;
    const result = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(searchTerm)}&type=track`, {
    method: 'GET',
    headers: { 
        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        'Content-Type': 'application/json'
    }
})
.then(response => response.json());
 
    let results = null;
    if (searchTerm != "") {
        results = result.tracks.items;
    }
 
    if (null != results) {
        results.forEach(result => {
            const resultElement = document.createElement("li");
            resultElement.classList.add("search-result");
            resultElement.innerHTML = `
                ${result.album.images.length > 0 ? '<img src="'+ result.album.images[0].url +'" alt="'+ result.name + '" class="track-img"></img>' : ''}
                <button class="result-play-btn" data-uri="${result.uri}">${result.name}</button>
                <p>${result.artists.map(artist => artist.name).join(', ')}</p>
            `;
            searchResultsContainer.appendChild(resultElement);
            document.querySelector(`.result-play-btn[data-uri="${result.uri}"]`).addEventListener("click", async () => {
                await playMusic(result.uri);
            });
        });
    }
 }

async function getPlaylists(profile) {
    const user_id = profile.id;
    const playlists = await fetch(`https://api.spotify.com/v1/users/${user_id}/playlists`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
    })
    .then(response => response.json());

    return playlists.items;
}

const search = document.getElementById("search-input");

search.addEventListener('input', () => {
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        searchMusic();
    }, 500);
});

async function playMusic(trackUri) {
    const uri = trackUri.split(":")
    const iframe = document.getElementById('music-player')

    iframe.src = `https://open.spotify.com/embed/${uri[1]}/${uri[2]}`
}

async function playPlaylist(playlistUri) {
    const uri = playlistUri.split(":")
    const iframe = document.getElementById('music-player')

    iframe.src = `https://open.spotify.com/embed/${uri[1]}/${uri[2]}`
}